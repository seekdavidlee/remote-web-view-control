using Microsoft.AspNetCore.SignalR;
using RemoteWebViewControl.Services;

namespace RemoteWebViewControl.Hubs;

public class RemoteViewHub(SessionService sessionService, ILogger<RemoteViewHub> logger) : Hub
{
    public async Task<bool> ServerJoinSession(string clientName)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null)
        {
            logger.LogWarning("Server tried to join session for non-existent client: {ClientName}", clientName);
            return false;
        }

        sessionService.SetServerConnection(clientName, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session-{clientName}");
        logger.LogInformation("Server joined session for client: {ClientName}", clientName);
        
        // If client is already connected, notify the server immediately
        if (!string.IsNullOrEmpty(session.ClientConnectionId))
        {
            await Clients.Caller.SendAsync("ClientConnected");
            logger.LogInformation("Notified server that client {ClientName} is already connected", clientName);
        }
        
        return true;
    }

    public async Task<bool> ClientJoinSession(string clientName)
    {
        var session = sessionService.GetOrCreateSession(clientName);
        
        sessionService.SetClientConnection(clientName, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session-{clientName}");
        
        // Notify the server that client has connected
        if (!string.IsNullOrEmpty(session.ServerConnectionId))
        {
            await Clients.Client(session.ServerConnectionId).SendAsync("ClientConnected");
        }

        logger.LogInformation("Client joined session: {ClientName}", clientName);
        return true;
    }

    public async Task SendUrlToClient(string clientName, string url)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null || string.IsNullOrEmpty(session.ClientConnectionId))
        {
            logger.LogWarning("Cannot send URL - no client connected for: {ClientName}", clientName);
            return;
        }

        await Clients.Client(session.ClientConnectionId).SendAsync("ReceiveUrl", url);
        logger.LogInformation("URL sent to client {ClientName}: {Url}", clientName, url);
    }

    public async Task ExecuteScriptOnClient(string clientName, string script)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null || string.IsNullOrEmpty(session.ClientConnectionId))
        {
            logger.LogWarning("Cannot execute script - no client connected for: {ClientName}", clientName);
            return;
        }

        await Clients.Client(session.ClientConnectionId).SendAsync("ExecuteScript", script);
        logger.LogInformation("Script sent to client {ClientName}", clientName);
    }

    public async Task SimulateMouseClick(string clientName, int x, int y)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null || string.IsNullOrEmpty(session.ClientConnectionId))
        {
            logger.LogWarning("Cannot simulate mouse click - no client connected for: {ClientName}", clientName);
            return;
        }

        await Clients.Client(session.ClientConnectionId).SendAsync("SimulateMouseClick", x, y);
        logger.LogInformation("Mouse click simulation sent to client {ClientName} at ({X}, {Y})", clientName, x, y);
    }

    public async Task SendLogMessage(string clientName, string level, string message)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null || string.IsNullOrEmpty(session.ServerConnectionId))
        {
            return;
        }

        await Clients.Client(session.ServerConnectionId).SendAsync("ReceiveLogMessage", level, message, DateTime.UtcNow);
    }

    public async Task SendDisplayDimensions(string clientName, int width, int height)
    {
        var session = sessionService.GetSession(clientName);
        if (session == null || string.IsNullOrEmpty(session.ServerConnectionId))
        {
            logger.LogWarning("Cannot send display dimensions - no server connected for: {ClientName}", clientName);
            return;
        }

        await Clients.Client(session.ServerConnectionId).SendAsync("ReceiveDisplayDimensions", width, height);
        logger.LogInformation("Display dimensions sent to server for client {ClientName}: {Width}x{Height}", clientName, width, height);
    }

    public async Task ClearAllSessions()
    {
        var allSessions = sessionService.GetAllSessions().ToList();
        
        logger.LogInformation("Clearing {Count} sessions", allSessions.Count);
        
        foreach (var session in allSessions)
        {
            // Notify client apps to reset first
            if (!string.IsNullOrEmpty(session.ClientConnectionId))
            {
                try
                {
                    logger.LogInformation("Sending ResetClient to session {ClientName}", session.ClientName);
                    await Clients.Client(session.ClientConnectionId).SendAsync("ResetClient");
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error sending reset to client {ClientName}", session.ClientName);
                }
            }
            
            // Notify server pages to reset
            if (!string.IsNullOrEmpty(session.ServerConnectionId))
            {
                try
                {
                    logger.LogInformation("Sending ResetServer to session {ClientName}", session.ClientName);
                    await Clients.Client(session.ServerConnectionId).SendAsync("ResetServer");
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error sending reset to server for client {ClientName}", session.ClientName);
                }
            }
        }
        
        // Give clients time to receive the reset signal before clearing sessions
        await Task.Delay(500);
        
        // Clear all sessions
        sessionService.ClearAllSessions();
        logger.LogInformation("All sessions cleared");
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var session = sessionService.GetSessionByConnectionId(Context.ConnectionId);
        if (session != null)
        {
            bool wasServer = session.ServerConnectionId == Context.ConnectionId;
            bool wasClient = session.ClientConnectionId == Context.ConnectionId;

            sessionService.RemoveConnection(Context.ConnectionId);

            if (wasClient && !string.IsNullOrEmpty(session.ServerConnectionId))
            {
                await Clients.Client(session.ServerConnectionId).SendAsync("ClientDisconnected");
            }

            if (wasServer && !string.IsNullOrEmpty(session.ClientConnectionId))
            {
                await Clients.Client(session.ClientConnectionId).SendAsync("ServerDisconnected");
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}
