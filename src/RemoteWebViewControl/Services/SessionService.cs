using System.Collections.Concurrent;

namespace RemoteWebViewControl.Services;

public class Session
{
    public string ClientName { get; set; } = string.Empty;
    public string? ServerConnectionId { get; set; }
    public string? ClientConnectionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;
    public bool IsServerConnected => !string.IsNullOrEmpty(ServerConnectionId);
    public bool IsClientConnected => !string.IsNullOrEmpty(ClientConnectionId);
}

public class SessionService
{
    private readonly ConcurrentDictionary<string, Session> _sessions = new();

    public Session GetOrCreateSession(string clientName)
    {
        var normalizedName = NormalizeClientName(clientName);
        
        return _sessions.GetOrAdd(normalizedName, name => new Session 
        { 
            ClientName = name 
        });
    }

    public bool ClientExists(string clientName)
    {
        var normalizedName = NormalizeClientName(clientName);
        return _sessions.TryGetValue(normalizedName, out var session) && session.IsClientConnected;
    }

    public Session? GetSession(string clientName)
    {
        var normalizedName = NormalizeClientName(clientName);
        _sessions.TryGetValue(normalizedName, out var session);
        return session;
    }

    public void SetServerConnection(string clientName, string connectionId)
    {
        var normalizedName = NormalizeClientName(clientName);
        if (_sessions.TryGetValue(normalizedName, out var session))
        {
            session.ServerConnectionId = connectionId;
            session.LastActivity = DateTime.UtcNow;
        }
    }

    public void SetClientConnection(string clientName, string connectionId)
    {
        var session = GetOrCreateSession(clientName);
        session.ClientConnectionId = connectionId;
        session.LastActivity = DateTime.UtcNow;
    }

    public void RemoveConnection(string connectionId)
    {
        foreach (var session in _sessions.Values)
        {
            if (session.ServerConnectionId == connectionId)
            {
                session.ServerConnectionId = null;
                session.LastActivity = DateTime.UtcNow;
            }
            if (session.ClientConnectionId == connectionId)
            {
                session.ClientConnectionId = null;
                session.LastActivity = DateTime.UtcNow;
            }
        }
    }

    public Session? GetSessionByConnectionId(string connectionId)
    {
        return _sessions.Values.FirstOrDefault(s => 
            s.ServerConnectionId == connectionId || s.ClientConnectionId == connectionId);
    }

    public IEnumerable<Session> GetAllSessions()
    {
        return _sessions.Values.OrderByDescending(s => s.LastActivity);
    }

    public void ClearAllSessions()
    {
        _sessions.Clear();
    }

    private static string NormalizeClientName(string clientName)
    {
        return clientName.ToUpperInvariant().Trim();
    }
}
