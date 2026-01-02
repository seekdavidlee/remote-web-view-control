namespace RemoteWebViewControl.Models;

public class ActionTrigger
{
    public string Type { get; set; } = "elementVisible"; // "elementVisible" or "immediate"
    public string? ElementType { get; set; } = "div"; // "div" or "button"
    public string? Selector { get; set; } = string.Empty; // CSS selector or element identifier
    public double TimeoutSeconds { get; set; } = 0; // Timeout in seconds (0 = infinite wait, no timeout)
}

public class ActionDefinition
{
    public string Type { get; set; } = "click"; // "click", "navigate", or "script"
    public int? ClickX { get; set; } // X coordinate for click action
    public int? ClickY { get; set; } // Y coordinate for click action
    public string? Url { get; set; } // For navigate action
    public string? Script { get; set; } // For script action
    public double DelaySeconds { get; set; } = 0; // Optional delay before executing action (supports decimals)
}

public class ActionStep
{
    public ActionTrigger Trigger { get; set; } = new();
    public ActionDefinition Action { get; set; } = new();
}

public class ClientAction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty; // URL where this action applies
    public bool IsActive { get; set; } = true;
    public List<ActionStep> Actions { get; set; } = new(); // Array of sequential action steps
    
    // Deprecated - kept for backward compatibility
    public ActionTrigger? Trigger { get; set; }
    public ActionDefinition? Action { get; set; }
    public double DelaySeconds { get; set; } = 0;
    public string? NextActionId { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastTriggered { get; set; }
}
