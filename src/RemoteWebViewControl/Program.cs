using RemoteWebViewControl.Hubs;
using RemoteWebViewControl.Services;
using RemoteWebViewControl.Models;

var builder = WebApplication.CreateBuilder(args);

// Add CORS policy for Electron clients
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowElectronClients", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Add services with longer timeouts for Raspberry Pi
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.HandshakeTimeout = TimeSpan.FromSeconds(30); // Increase handshake timeout for slower devices
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
});
builder.Services.AddSingleton<SessionService>();
builder.Services.AddSingleton<ActionService>();

var app = builder.Build();

// Configure middleware
app.UseCors("AllowElectronClients"); // Enable CORS before other middleware
app.UseWebSockets(); // Enable WebSockets support
app.UseDefaultFiles();
app.UseStaticFiles();

// Map SignalR hub
app.MapHub<RemoteViewHub>("/hub/remoteview");

// API Endpoints
app.MapGet("/api/client/exists/{clientName}", (string clientName, SessionService sessionService) =>
{
    var exists = sessionService.ClientExists(clientName);
    return Results.Ok(new { exists });
});

// Admin API Endpoints
app.MapGet("/api/admin/sessions", (SessionService sessionService) =>
{
    var sessions = sessionService.GetAllSessions();
    return Results.Ok(sessions);
});

app.MapPost("/api/admin/clear", (SessionService sessionService) =>
{
    sessionService.ClearAllSessions();
    return Results.Ok(new { success = true, message = "All sessions cleared" });
});

// Action API Endpoints
app.MapGet("/api/actions/{clientName}", (string clientName, ActionService actionService) =>
{
    var actions = actionService.GetActionsForClient(clientName);
    return Results.Ok(actions);
});

app.MapGet("/api/actions/{clientName}/active", (string clientName, ActionService actionService) =>
{
    var actions = actionService.GetActiveActionsForClient(clientName);
    return Results.Ok(actions);
});

app.MapPost("/api/actions/{clientName}", (string clientName, ClientAction action, ActionService actionService) =>
{
    action.ClientName = clientName;
    var created = actionService.CreateAction(action);
    return Results.Created($"/api/actions/{clientName}/{created.Id}", created);
});

app.MapPut("/api/actions/{clientName}/{actionId}", (string clientName, string actionId, ClientAction action, ActionService actionService) =>
{
    var updated = actionService.UpdateAction(clientName, actionId, action);
    if (updated)
    {
        return Results.Ok(action);
    }
    return Results.NotFound(new { error = "Action not found" });
});

app.MapDelete("/api/actions/{clientName}/{actionId}", (string clientName, string actionId, ActionService actionService) =>
{
    var deleted = actionService.DeleteAction(clientName, actionId);
    if (deleted)
    {
        return Results.Ok(new { success = true, message = "Action deleted" });
    }
    return Results.NotFound(new { error = "Action not found" });
});

app.MapPatch("/api/actions/{clientName}/{actionId}/toggle", (string clientName, string actionId, ActionService actionService, HttpRequest request) =>
{
    var body = request.ReadFromJsonAsync<Dictionary<string, bool>>().Result;
    if (body != null && body.TryGetValue("isActive", out var isActive))
    {
        var toggled = actionService.ToggleAction(clientName, actionId, isActive);
        if (toggled)
        {
            return Results.Ok(new { success = true, isActive });
        }
    }
    return Results.NotFound(new { error = "Action not found" });
});

// Route redirects for clean URLs
app.MapGet("/server/{clientName}", async (string clientName, SessionService sessionService, HttpContext context) =>
{
    // Check if client exists
    if (!sessionService.ClientExists(clientName))
    {
        // Redirect to admin page with error message
        return Results.Redirect($"/admin?error={Uri.EscapeDataString("Client does not exist or is not connected")}");
    }
    
    // Return the server.html file with correct content type
    var filePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "server.html");
    var htmlContent = await File.ReadAllTextAsync(filePath);
    return Results.Content(htmlContent, "text/html");
});

app.MapGet("/server", () => Results.Redirect("/admin"));
app.MapGet("/admin", () => Results.Redirect("/admin.html"));
app.MapGet("/test/mouse-click", () => Results.Redirect("/test/mouse-click.html"));
app.MapGet("/", () => Results.Redirect("/admin"));

app.Run();
