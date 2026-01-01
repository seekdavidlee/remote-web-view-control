/**
 * Action Executor
 * Monitors the DOM for elements specified in actions and executes them when triggered.
 * Uses MutationObserver to detect dynamically inserted elements.
 */

class ActionExecutor {
    constructor() {
        this.actions = [];
        this.observers = new Map();
        this.executedActions = new Set();
        this.isEnabled = false;
    }

    /**
     * Load and activate actions
     * @param {Array} actions - Array of action definitions from server
     */
    loadActions(actions) {
        console.log('[ActionExecutor] Loading actions:', actions);
        
        // Stop existing observers
        this.stopAllObservers();
        
        // Reset executed actions when loading new set
        this.executedActions.clear();
        
        // Store active actions only
        this.actions = actions.filter(action => action.isActive);
        
        console.log(`[ActionExecutor] Loaded ${this.actions.length} active actions`);
        
        // Start monitoring if enabled
        if (this.isEnabled && this.actions.length > 0) {
            this.startMonitoring();
        }
    }

    /**
     * Enable action execution
     */
    enable() {
        this.isEnabled = true;
        if (this.actions.length > 0) {
            this.startMonitoring();
        }
    }

    /**
     * Disable action execution
     */
    disable() {
        this.isEnabled = false;
        this.stopAllObservers();
    }

    /**
     * Start monitoring the DOM for action triggers
     */
    startMonitoring() {
        console.log('[ActionExecutor] Starting DOM monitoring');
        
        // Create a MutationObserver for each action with element-based triggers
        this.actions.forEach(action => {
            if (action.trigger.type === 'immediate') {
                // Execute immediate actions right away
                console.log(`[ActionExecutor] Executing immediate action: ${action.name}`);
                this.executeAction(action, null);
            } else {
                // Create observer for element-based triggers
                this.createObserverForAction(action);
            }
        });

        // Also check for elements that might already exist in the DOM (for element-based triggers)
        this.checkExistingElements();
    }

    /**
     * Check if any target elements already exist in the DOM
     */
    checkExistingElements() {
        this.actions.forEach(action => {
            const element = this.findElement(action.trigger);
            if (element && this.isElementVisible(element)) {
                console.log(`[ActionExecutor] Element already exists and is visible for action: ${action.name}`);
                this.executeAction(action, element);
            }
        });
    }

    /**
     * Create a MutationObserver for a specific action
     * @param {Object} action - Action definition
     */
    createObserverForAction(action) {
        // Don't create duplicate observers
        if (this.observers.has(action.id)) {
            return;
        }

        const observer = new MutationObserver((mutations) => {
            // Only process if action hasn't been executed yet
            if (this.executedActions.has(action.id)) {
                return;
            }

            const element = this.findElement(action.trigger);
            if (element && this.isElementVisible(element)) {
                console.log(`[ActionExecutor] Element became visible for action: ${action.name}`);
                this.executeAction(action, element);
            }
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden']
        });

        this.observers.set(action.id, observer);
        console.log(`[ActionExecutor] Created observer for action: ${action.name}`);
    }

    /**
     * Find an element based on trigger configuration
     * @param {Object} trigger - Trigger configuration
     * @returns {Element|null} Found element or null
     */
    findElement(trigger) {
        try {
            // First try the selector as-is
            let element = document.querySelector(trigger.selector);
            
            // If not found and element type is specified, try with element type
            if (!element && trigger.elementType) {
                element = document.querySelector(`${trigger.elementType}${trigger.selector}`);
            }

            return element;
        } catch (error) {
            console.error(`[ActionExecutor] Error finding element with selector "${trigger.selector}":`, error);
            return null;
        }
    }

    /**
     * Check if an element is visible
     * @param {Element} element - DOM element to check
     * @returns {boolean} True if element is visible
     */
    isElementVisible(element) {
        if (!element) return false;

        // Check if element is in the DOM
        if (!document.body.contains(element)) {
            return false;
        }

        // Check basic visibility
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        // Check if element has dimensions
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }

        return true;
    }

    /**
     * Execute an action
     * @param {Object} action - Action to execute
     * @param {Element} element - Target element (may be null for immediate actions)
     */
    async executeAction(action, element) {
        // Mark as executed to prevent duplicate execution
        this.executedActions.add(action.id);

        console.log(`[ActionExecutor] Executing action: ${action.name}`);
        console.log(`[ActionExecutor] Action object:`, action);
        console.log(`[ActionExecutor] Action type: ${action.action?.type}`);
        console.log(`[ActionExecutor] Delay: ${action.action?.delaySeconds} seconds`);

        // Apply delay if specified
        const delaySeconds = action.action?.delaySeconds || 0;
        if (delaySeconds > 0) {
            console.log(`[ActionExecutor] Waiting ${delaySeconds} seconds...`);
            await this.delay(delaySeconds * 1000);
            console.log(`[ActionExecutor] Delay complete, executing now`);
        }

        // Execute the action based on type
        switch (action.action?.type) {
            case 'click':
                this.performClick(element, action);
                break;
            
            case 'navigate':
                this.performNavigation(action.action.url, action);
                break;
            
            case 'script':
                this.performScript(action.action.script, action);
                break;
            
            default:
                console.warn(`[ActionExecutor] Unknown action type: ${action.action?.type}`);
        }

        // Notify server that action was triggered
        this.notifyActionTriggered(action.id);
    }

    /**
     * Perform a mouse click at coordinates
     * @param {Element} element - Element that triggered the action (for reference)
     * @param {Object} action - Action definition
     */
    performClick(element, action) {
        try {
            console.log(`[ActionExecutor] Simulating mouse click for action: ${action.name}`);
            
            // Get coordinates from action or use element position as fallback
            let x = action.action.clickX;
            let y = action.action.clickY;
            
            if (x === null || x === undefined || y === null || y === undefined) {
                // Fallback: get element position
                const rect = element.getBoundingClientRect();
                x = Math.floor(rect.left + rect.width / 2);
                y = Math.floor(rect.top + rect.height / 2);
                console.log(`[ActionExecutor] Using element center: (${x}, ${y})`);
            } else {
                console.log(`[ActionExecutor] Using configured coordinates: (${x}, ${y})`);
            }
            
            // Notify server to perform the mouse click via SimulateMouseClick
            if (window.actionExecutorAPI && window.actionExecutorAPI.simulateClick) {
                window.actionExecutorAPI.simulateClick(x, y);
            } else {
                console.error(`[ActionExecutor] actionExecutorAPI.simulateClick not available`);
            }
        } catch (error) {
            console.error(`[ActionExecutor] Error simulating mouse click:`, error);
        }
    }

    /**
     * Navigate to a URL
     * @param {string} url - URL to navigate to
     * @param {Object} action - Action definition
     */
    performNavigation(url, action) {
        try {
            console.log(`[ActionExecutor] Navigating to URL for action: ${action.name}`, url);
            window.location.href = url;
        } catch (error) {
            console.error(`[ActionExecutor] Error navigating to URL:`, error);
        }
    }

    /**
     * Execute a JavaScript script
     * @param {string} script - Script to execute
     * @param {Object} action - Action definition
     */
    performScript(script, action) {
        try {
            console.log(`[ActionExecutor] Executing script for action: ${action.name}`);
            console.log(`[ActionExecutor] Script to execute:`, script);
            
            // Special handling for fullscreen requests
            if (script.includes('requestFullscreen')) {
                console.log(`[ActionExecutor] Detected fullscreen request`);
                this.requestFullscreen();
            } else {
                const result = eval(script);
                console.log(`[ActionExecutor] Script executed successfully, result:`, result);
            }
        } catch (error) {
            console.error(`[ActionExecutor] Error executing script:`, error);
        }
    }

    /**
     * Request fullscreen with multiple fallback methods
     */
    requestFullscreen() {
        console.log(`[ActionExecutor] Requesting fullscreen...`);
        
        // Use keyboard simulation to press 'f' key (works for YouTube and most video players)
        if (window.actionExecutorAPI && window.actionExecutorAPI.simulateKeyPress) {
            console.log(`[ActionExecutor] Simulating 'f' key press for fullscreen`);
            window.actionExecutorAPI.simulateKeyPress('f');
            console.log(`[ActionExecutor] Fullscreen key press sent`);
        } else {
            console.error(`[ActionExecutor] actionExecutorAPI.simulateKeyPress not available`);
        }
    }

    /**
     * Notify the server that an action was triggered
     * @param {string} actionId - ID of the triggered action
     */
    notifyActionTriggered(actionId) {
        // This will be called by the preload script when available
        if (window.actionExecutorAPI && window.actionExecutorAPI.notifyActionTriggered) {
            window.actionExecutorAPI.notifyActionTriggered(actionId);
        } else {
            console.log(`[ActionExecutor] Would notify server of action trigger: ${actionId}`);
        }
    }

    /**
     * Stop all observers
     */
    stopAllObservers() {
        this.observers.forEach((observer, actionId) => {
            observer.disconnect();
            console.log(`[ActionExecutor] Stopped observer for action: ${actionId}`);
        });
        this.observers.clear();
    }

    /**
     * Utility function for delay
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get status information
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            actionCount: this.actions.length,
            activeObservers: this.observers.size,
            executedActions: this.executedActions.size
        };
    }
}

// Create global instance
const actionExecutor = new ActionExecutor();

// Expose to window for debugging
window.actionExecutor = actionExecutor;

// Log initialization
console.log('[ActionExecutor] Initialized and ready');
