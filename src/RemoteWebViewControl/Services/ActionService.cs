using System.Collections.Concurrent;
using RemoteWebViewControl.Models;

namespace RemoteWebViewControl.Services;

public class ActionService(ILogger<ActionService> logger)
{
    private readonly ConcurrentDictionary<string, List<ClientAction>> _clientActions = new();
    private readonly ILogger<ActionService> _logger = logger;

    public ClientAction CreateAction(ClientAction action)
    {
        var normalizedClientName = NormalizeClientName(action.ClientName);
        action.ClientName = normalizedClientName;
        
        var actions = _clientActions.GetOrAdd(normalizedClientName, _ => new List<ClientAction>());
        
        lock (actions)
        {
            actions.Add(action);
        }
        
        _logger.LogInformation("Created action {ActionId} for client {ClientName}: {ActionName}", 
            action.Id, action.ClientName, action.Name);
        
        return action;
    }

    public IEnumerable<ClientAction> GetActionsForClient(string clientName)
    {
        var normalizedClientName = NormalizeClientName(clientName);
        
        if (_clientActions.TryGetValue(normalizedClientName, out var actions))
        {
            lock (actions)
            {
                return actions.ToList();
            }
        }
        
        return [];
    }

    public IEnumerable<ClientAction> GetActiveActionsForClient(string clientName)
    {
        return GetActionsForClient(clientName).Where(a => a.IsActive);
    }

    public ClientAction? GetAction(string clientName, string actionId)
    {
        var normalizedClientName = NormalizeClientName(clientName);
        
        if (_clientActions.TryGetValue(normalizedClientName, out var actions))
        {
            lock (actions)
            {
                return actions.FirstOrDefault(a => a.Id == actionId);
            }
        }
        
        return null;
    }

    public bool UpdateAction(string clientName, string actionId, ClientAction updatedAction)
    {
        var normalizedClientName = NormalizeClientName(clientName);
        
        if (_clientActions.TryGetValue(normalizedClientName, out var actions))
        {
            lock (actions)
            {
                var index = actions.FindIndex(a => a.Id == actionId);
                if (index >= 0)
                {
                    updatedAction.Id = actionId;
                    updatedAction.ClientName = normalizedClientName;
                    updatedAction.CreatedAt = actions[index].CreatedAt;
                    actions[index] = updatedAction;
                    
                    _logger.LogInformation("Updated action {ActionId} for client {ClientName}", 
                        actionId, clientName);
                    
                    return true;
                }
            }
        }
        
        return false;
    }

    public bool DeleteAction(string clientName, string actionId)
    {
        var normalizedClientName = NormalizeClientName(clientName);
        
        if (_clientActions.TryGetValue(normalizedClientName, out var actions))
        {
            lock (actions)
            {
                var removed = actions.RemoveAll(a => a.Id == actionId) > 0;
                
                if (removed)
                {
                    _logger.LogInformation("Deleted action {ActionId} for client {ClientName}", 
                        actionId, clientName);
                }
                
                return removed;
            }
        }
        
        return false;
    }

    public bool ToggleAction(string clientName, string actionId, bool isActive)
    {
        var action = GetAction(clientName, actionId);
        if (action != null)
        {
            action.IsActive = isActive;
            _logger.LogInformation("Toggled action {ActionId} for client {ClientName} to {IsActive}", 
                actionId, clientName, isActive);
            return true;
        }
        
        return false;
    }

    public void RecordActionTriggered(string clientName, string actionId)
    {
        var action = GetAction(clientName, actionId);
        if (action != null)
        {
            action.LastTriggered = DateTime.UtcNow;
            _logger.LogInformation("Action {ActionId} triggered for client {ClientName}", 
                actionId, clientName);
        }
    }

    public int GetActionCount(string clientName)
    {
        return GetActionsForClient(clientName).Count();
    }

    public Dictionary<string, int> GetAllClientActionCounts()
    {
        return _clientActions.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value.Count
        );
    }

    private static string NormalizeClientName(string clientName)
    {
        return clientName.ToUpperInvariant().Trim();
    }
}
