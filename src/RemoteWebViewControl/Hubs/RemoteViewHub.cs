using Microsoft.AspNetCore.SignalR;
using RemoteWebViewControl.Services;

namespace RemoteWebViewControl.Hubs;

public class RemoteViewHub(SessionService sessionService, ILogger<RemoteViewHub> logger) : Hub
{
    public async Task<bool> ServerJoinSession(string code)
    {
        var session = sessionService.GetSession(code);
        if (session == null)
        {
            logger.LogWarning("Server tried to join invalid session: {Code}", code);
            return false;
        }

        sessionService.SetServerConnection(code, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session-{code}");
        logger.LogInformation("Server joined session: {Code}", code);
        return true;
    }

    public async Task<bool> ClientJoinSession(string code)
    {
        var session = sessionService.GetSession(code);
        if (session == null)
        {
            logger.LogWarning("Client tried to join invalid session: {Code}", code);
            return false;
        }

        sessionService.SetClientConnection(code, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session-{code}");
        
        // Notify the server that client has connected
        if (!string.IsNullOrEmpty(session.ServerConnectionId))
        {
            await Clients.Client(session.ServerConnectionId).SendAsync("ClientConnected");
        }

        logger.LogInformation("Client joined session: {Code}", code);
        return true;
    }

    public async Task SendUrlToClient(string code, string url)
    {
        var session = sessionService.GetSession(code);
        if (session == null || string.IsNullOrEmpty(session.ClientConnectionId))
        {
            logger.LogWarning("Cannot send URL - no client connected for session: {Code}", code);
            return;
        }

        await Clients.Client(session.ClientConnectionId).SendAsync("ReceiveUrl", url);
        logger.LogInformation("URL sent to client in session {Code}: {Url}", code, url);
    }

    public async Task ExecuteScriptOnClient(string code, string script)
    {
        var session = sessionService.GetSession(code);
        if (session == null || string.IsNullOrEmpty(session.ClientConnectionId))
        {
            logger.LogWarning("Cannot execute script - no client connected for session: {Code}", code);
            return;
        }

        await Clients.Client(session.ClientConnectionId).SendAsync("ExecuteScript", script);
        logger.LogInformation("Script sent to client in session {Code}", code);
    }

    public async Task ClearAllSessions()
    {
        var allSessions = sessionService.GetAllSessions().ToList();
        
        foreach (var session in allSessions)
        {
            // Notify server pages to reset
            if (!string.IsNullOrEmpty(session.ServerConnectionId))
            {
                await Clients.Client(session.ServerConnectionId).SendAsync("ResetServer");
            }
            
            // Notify client apps to reset
            if (!string.IsNullOrEmpty(session.ClientConnectionId))
            {
                await Clients.Client(session.ClientConnectionId).SendAsync("ResetClient");
            }
        }
        
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
