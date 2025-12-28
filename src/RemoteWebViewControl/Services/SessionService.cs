using System.Collections.Concurrent;

namespace RemoteWebViewControl.Services;

public class Session
{
    public string Code { get; set; } = string.Empty;
    public string? ServerConnectionId { get; set; }
    public string? ClientConnectionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsServerConnected => !string.IsNullOrEmpty(ServerConnectionId);
    public bool IsClientConnected => !string.IsNullOrEmpty(ClientConnectionId);
}

public class SessionService
{
    private readonly ConcurrentDictionary<string, Session> _sessions = new();
    private static readonly Random _random = new();
    private const string AlphaNumericChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    public string CreateSession()
    {
        string code;
        do
        {
            code = GenerateCode();
        } while (_sessions.ContainsKey(code));

        var session = new Session { Code = code };
        _sessions[code] = session;
        return code;
    }

    public bool ValidateCode(string code)
    {
        return _sessions.ContainsKey(code.ToUpperInvariant());
    }

    public Session? GetSession(string code)
    {
        _sessions.TryGetValue(code.ToUpperInvariant(), out var session);
        return session;
    }

    public void SetServerConnection(string code, string connectionId)
    {
        if (_sessions.TryGetValue(code.ToUpperInvariant(), out var session))
        {
            session.ServerConnectionId = connectionId;
        }
    }

    public void SetClientConnection(string code, string connectionId)
    {
        if (_sessions.TryGetValue(code.ToUpperInvariant(), out var session))
        {
            session.ClientConnectionId = connectionId;
        }
    }

    public void RemoveConnection(string connectionId)
    {
        foreach (var session in _sessions.Values)
        {
            if (session.ServerConnectionId == connectionId)
            {
                session.ServerConnectionId = null;
            }
            if (session.ClientConnectionId == connectionId)
            {
                session.ClientConnectionId = null;
            }
        }
    }

    public Session? GetSessionByConnectionId(string connectionId)
    {
        return _sessions.Values.FirstOrDefault(s => 
            s.ServerConnectionId == connectionId || s.ClientConnectionId == connectionId);
    }

    private static string GenerateCode()
    {
        return new string([.. Enumerable.Range(0, 5).Select(_ => AlphaNumericChars[_random.Next(AlphaNumericChars.Length)])]);
    }
}
