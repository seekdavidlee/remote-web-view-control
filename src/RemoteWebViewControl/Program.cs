using RemoteWebViewControl.Hubs;
using RemoteWebViewControl.Services;

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

var app = builder.Build();

// Configure middleware
app.UseCors("AllowElectronClients"); // Enable CORS before other middleware
app.UseWebSockets(); // Enable WebSockets support
app.UseDefaultFiles();
app.UseStaticFiles();

// Map SignalR hub
app.MapHub<RemoteViewHub>("/hub/remoteview");

// API Endpoints
app.MapPost("/api/session/create", (SessionService sessionService) =>
{
    var code = sessionService.CreateSession();
    return Results.Ok(new { code });
});

app.MapGet("/api/session/validate/{code}", (string code, SessionService sessionService) =>
{
    var valid = sessionService.ValidateCode(code);
    return Results.Ok(new { valid });
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

// Route redirects for clean URLs
app.MapGet("/server", () => Results.Redirect("/server.html"));
app.MapGet("/admin", () => Results.Redirect("/admin.html"));
app.MapGet("/", () => Results.Redirect("/server.html"));

app.Run();
