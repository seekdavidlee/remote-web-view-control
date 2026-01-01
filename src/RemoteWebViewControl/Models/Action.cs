namespace RemoteWebViewControl.Models;

public class ActionTrigger
{
    public string Type { get; set; } = "elementVisible"; // Future: could add more trigger types
    public string ElementType { get; set; } = "div"; // "div" or "button"
    public string Selector { get; set; } = string.Empty; // CSS selector or element identifier
}

public class ActionDefinition
{
    public string Type { get; set; } = "click"; // "click" or "navigate"
    public int? ClickX { get; set; } // X coordinate for click action
    public int? ClickY { get; set; } // Y coordinate for click action
    public string? Url { get; set; } // For navigate action
    public int DelaySeconds { get; set; } = 0; // Optional delay before executing action
}

public class ClientAction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty; // URL where this action applies
    public bool IsActive { get; set; } = true;
    public ActionTrigger Trigger { get; set; } = new();
    public ActionDefinition Action { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastTriggered { get; set; }
}
