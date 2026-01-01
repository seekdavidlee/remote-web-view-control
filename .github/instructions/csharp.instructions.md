---
applyTo: "**/*.cs"
name: "C# Rules"
description: "C# coding standards"
---
# C# Guidelines

## .NET Version

Always use **.NET 10** when creating new projects. Use the `--framework net10.0` flag with `dotnet new` commands:

```bash
dotnet new webapi --framework net10.0
dotnet new console --framework net10.0
dotnet new classlib --framework net10.0
```

## Dependency Injection

### Use Primary Constructors

Always use C# 12+ primary constructor syntax for dependency injection instead of traditional constructor injection with field assignments.

**✅ Do this:**
```csharp
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled exception occurred: {Message}", exception.Message);
        // ...
    }
}
```

**❌ Don't do this:**
```csharp
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Unhandled exception occurred: {Message}", exception.Message);
        // ...
    }
}
```

## Naming Conventions

### No Underscore Prefix for Class Variables

Do not use underscore prefix (`_`) for naming class-level variables or fields. Use camelCase for private fields and PascalCase for public properties.

> **Note:** When constructor parameters share the same name as fields, use `this.` to disambiguate assignments (e.g., `this.logger = logger;`).

**✅ Do this:**
```csharp
public class MyService(ILogger<MyService> logger, IConfiguration configuration)
{
    private readonly string connectionString = configuration.GetConnectionString("Default")!;
}
```

**✅ Also acceptable (when complex initialization is needed):**
```csharp
public class MyService
{
    private readonly ILogger<MyService> logger;
    private readonly AIProjectClient projectClient;
    private readonly string modelDeploymentName;

    public MyService(ILogger<MyService> logger, IConfiguration configuration)
    {
        this.logger = logger;
        
        // Complex initialization logic that can't be done in field initializers
        var endpoint = Environment.GetEnvironmentVariable("ENDPOINT") 
            ?? configuration["Endpoint"];
        projectClient = new AIProjectClient(new Uri(endpoint), new DefaultAzureCredential());
        modelDeploymentName = configuration["ModelDeploymentName"] ?? "gpt-4o";
    }
}
```

**❌ Don't do this:**
```csharp
public class MyService
{
    private readonly ILogger<MyService> _logger;
    private readonly string _connectionString;
}
```

### Async Method Suffix

All async methods must end with the `Async` suffix. This makes it immediately clear that the method is asynchronous and should be awaited.

**✅ Do this:**
```csharp
public async Task<IActionResult> GetAgentsAsync(CancellationToken cancellationToken)
{
    var agents = await agentService.GetAgentsAsync(cancellationToken);
    return Ok(agents);
}
```

**❌ Don't do this:**
```csharp
public async Task<IActionResult> GetAgents(CancellationToken cancellationToken)
{
    var agents = await agentService.GetAgentsAsync(cancellationToken);
    return Ok(agents);
}
```

### Summary

| Element | Convention | Example |
|---------|------------|---------|
| Primary constructor parameters | camelCase | `logger`, `configuration` |
| Private fields (if needed) | camelCase, no underscore | `connectionString` |
| Public properties | PascalCase | `ConnectionString` |
| Local variables | camelCase | `result`, `itemCount` |
| Async methods | PascalCase with `Async` suffix | `GetAgentsAsync`, `CreateItemAsync` |
