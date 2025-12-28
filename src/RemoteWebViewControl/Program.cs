using RemoteWebViewControl.Hubs;
using RemoteWebViewControl.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddSignalR();
builder.Services.AddSingleton<SessionService>();

var app = builder.Build();

// Configure middleware
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

// Route redirects for clean URLs
app.MapGet("/server", () => Results.Redirect("/server.html"));
app.MapGet("/", () => Results.Redirect("/server.html"));

app.Run();
