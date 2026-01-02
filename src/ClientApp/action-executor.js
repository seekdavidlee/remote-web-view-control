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
        this.timeouts = new Map(); // Track timeout timers for actions
        this.isEnabled = false;
    }

    /**
     * Load and activate actions
     * @param {Array} actions - Array of action definitions from server
     */
    loadActions(actions) {
        try {
            console.log('[ActionExecutor] Loading actions:', actions);
            
            // Stop existing observers
            this.stopAllObservers();
            
            // Clear all timeouts
            this.clearAllTimeouts();
            
            // Reset executed actions when loading new set
            this.executedActions.clear();
            
            // Store active actions only
            this.actions = actions.filter(action => action.isActive);
            
            console.log(`[ActionExecutor] Loaded ${this.actions.length} active actions`);
            
            // Start monitoring if enabled
            if (this.isEnabled && this.actions.length > 0) {
                this.startMonitoring();
            }
        } catch (error) {
            console.error('[ActionExecutor] Error in loadActions:', error);
            throw error;
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
        this.clearAllTimeouts();
    }

    /**
     * Start monitoring the DOM for action triggers
     */
    startMonitoring() {
        console.log('[ActionExecutor] Starting DOM monitoring');
        
        // For each action, start with the first action step
        this.actions.forEach(action => {
            if (action.actions && action.actions.length > 0) {
                // New format: array of action steps
                console.log(`[ActionExecutor] Processing action: ${action.name} with ${action.actions.length} steps`);
                this.executeActionStep(action, 0);
            } else if (action.trigger) {
                // Legacy format: single trigger/action
                if (action.trigger.type === 'immediate') {
                    console.log(`[ActionExecutor] Executing immediate action: ${action.name}`);
                    this.executeAction(action, null);
                } else {
                    this.createObserverForAction(action);
                }
            }
        });

        // Also check for elements that might already exist in the DOM (for legacy format)
        this.checkExistingElements();
    }
    
    /**
     * Execute a specific step in an action's sequence
     * @param {Object} action - The parent action object
     * @param {number} stepIndex - Index of the step to execute
     */
    executeActionStep(action, stepIndex) {
        if (!action.actions || stepIndex >= action.actions.length) {
            console.log(`[ActionExecutor] Completed all steps for action: ${action.name}`);
            return;
        }
        
        const step = action.actions[stepIndex];
        const stepKey = `${action.id}-${stepIndex}`;
        
        console.log(`[ActionExecutor] Executing step ${stepIndex + 1}/${action.actions.length} for action: ${action.name}`);
        
        if (step.trigger.type === 'immediate') {
            // Execute immediately and move to next step
            this.performActionStep(action, stepIndex);
        } else {
            // Monitor for element
            this.createObserverForActionStep(action, stepIndex);
        }
    }

    /**
     * Check if any target elements already exist in the DOM
     */
    checkExistingElements() {
        this.actions.forEach(action => {
            const element = this.findElement(action.trigger);
            if (element && this.isElementVisible(element)) {
                console.log(`[ActionExecutor] Element already exists and is visible for action: ${action.name}`);
                // Clear timeout since element was found
                this.clearTimeout(action.id);
                this.executeAction(action, element);
            }
        });
    }

    /**
     * Create a MutationObserver for a specific action step
     * @param {Object} action - Parent action object
     * @param {number} stepIndex - Index of the step
     */
    createObserverForActionStep(action, stepIndex) {
        const step = action.actions[stepIndex];
        const stepKey = `${action.id}-${stepIndex}`;
        
        // Don't create duplicate observers
        if (this.observers.has(stepKey)) {
            return;
        }

        const observer = new MutationObserver((mutations) => {
            // Only process if this step hasn't been executed yet
            if (this.executedActions.has(stepKey)) {
                return;
            }

            const element = this.findElement(step.trigger);
            if (element && this.isElementVisible(element)) {
                console.log(`[ActionExecutor] Element became visible for step ${stepIndex + 1} of action: ${action.name}`);
                // Clear timeout since element was found
                this.clearTimeout(stepKey);
                this.performActionStep(action, stepIndex);
            }
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden']
        });

        this.observers.set(stepKey, observer);
        console.log(`[ActionExecutor] Created observer for step ${stepIndex + 1} of action: ${action.name}`);
        
        // Set up timeout if specified (and not 0 which means infinite wait)
        const timeoutSeconds = step.trigger?.timeoutSeconds || 0;
        if (timeoutSeconds > 0) {
            console.log(`[ActionExecutor] Setting timeout of ${timeoutSeconds} seconds for step ${stepIndex + 1}`);
            const timeoutId = setTimeout(() => {
                this.handleStepTimeout(action, stepIndex);
            }, timeoutSeconds * 1000);
            this.timeouts.set(stepKey, timeoutId);
        } else {
            console.log(`[ActionExecutor] No timeout set for step ${stepIndex + 1} (infinite wait)`);
        }
        
        // Check if element already exists
        const element = this.findElement(step.trigger);
        if (element && this.isElementVisible(element)) {
            console.log(`[ActionExecutor] Element already exists for step ${stepIndex + 1}`);
            this.clearTimeout(stepKey);
            this.performActionStep(action, stepIndex);
        }
    }
    
    /**
     * Perform an action step and move to the next
     * @param {Object} action - Parent action object
     * @param {number} stepIndex - Index of the step to perform
     */
    async performActionStep(action, stepIndex) {
        const step = action.actions[stepIndex];
        const stepKey = `${action.id}-${stepIndex}`;
        
        // Mark as executed
        this.executedActions.add(stepKey);
        
        // Clear timeout
        this.clearTimeout(stepKey);
        
        // Stop observing
        if (this.observers.has(stepKey)) {
            this.observers.get(stepKey).disconnect();
            this.observers.delete(stepKey);
        }
        
        console.log(`[ActionExecutor] Performing step ${stepIndex + 1}/${action.actions.length} for action: ${action.name}`);
        
        // Apply delay if specified
        const delaySeconds = step.action?.delaySeconds || 0;
        if (delaySeconds > 0) {
            console.log(`[ActionExecutor] Waiting ${delaySeconds} seconds...`);
            await this.delay(delaySeconds * 1000);
        }
        
        // Execute the action
        switch (step.action?.type) {
            case 'click':
                this.performClick(null, { action: step.action, name: `${action.name} - Step ${stepIndex + 1}` });
                break;
            case 'navigate':
                this.performNavigation(step.action.url, { name: `${action.name} - Step ${stepIndex + 1}` });
                break;
            case 'script':
                this.performScript(step.action.script, { name: `${action.name} - Step ${stepIndex + 1}` });
                break;
            default:
                console.warn(`[ActionExecutor] Unknown action type: ${step.action?.type}`);
        }
        
        // Move to next step
        const nextStepIndex = stepIndex + 1;
        if (nextStepIndex < action.actions.length) {
            console.log(`[ActionExecutor] Moving to step ${nextStepIndex + 1} of action: ${action.name}`);
            this.executeActionStep(action, nextStepIndex);
        } else {
            console.log(`[ActionExecutor] Completed all steps for action: ${action.name}`);
            // Notify server that entire action was triggered
            this.notifyActionTriggered(action.id);
        }
    }
    
    /**
     * Handle timeout for an action step
     * @param {Object} action - Parent action object
     * @param {number} stepIndex - Index of the step that timed out
     */
    handleStepTimeout(action, stepIndex) {
        const stepKey = `${action.id}-${stepIndex}`;
        console.log(`[ActionExecutor] Timeout occurred for step ${stepIndex + 1} of action: ${action.name}`);
        
        // Mark as executed to prevent it from executing later
        this.executedActions.add(stepKey);
        
        // Stop observing for this step
        if (this.observers.has(stepKey)) {
            this.observers.get(stepKey).disconnect();
            this.observers.delete(stepKey);
        }
        
        // Move to next step on timeout
        const nextStepIndex = stepIndex + 1;
        if (nextStepIndex < action.actions.length) {
            console.log(`[ActionExecutor] Timeout - moving to step ${nextStepIndex + 1} of action: ${action.name}`);
            this.executeActionStep(action, nextStepIndex);
        } else {
            console.log(`[ActionExecutor] Timeout - no more steps for action: ${action.name}`);
        }
    }
    
    /**
     * Create a MutationObserver for a specific action (legacy format)
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
                // Clear timeout since element was found
                this.clearTimeout(action.id);
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
        
        // Set up timeout if specified (and not 0 which means infinite wait)
        const timeoutSeconds = action.trigger?.timeoutSeconds || 0;
        if (timeoutSeconds > 0) {
            console.log(`[ActionExecutor] Setting timeout of ${timeoutSeconds} seconds for action: ${action.name}`);
            const timeoutId = setTimeout(() => {
                this.handleTimeout(action);
            }, timeoutSeconds * 1000);
            this.timeouts.set(action.id, timeoutId);
        } else {
            console.log(`[ActionExecutor] No timeout set for action: ${action.name} (infinite wait)`);
        }
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
        
        // Clear timeout for this action if it exists
        this.clearTimeout(action.id);

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
        
        // Execute next action in the chain if specified
        if (action.nextActionId) {
            console.log(`[ActionExecutor] Chaining to next action: ${action.nextActionId}`);
            this.executeNextAction(action.nextActionId);
        }
    }
    
    /**
     * Handle timeout for an action
     * @param {Object} action - Action that timed out
     */
    handleTimeout(action) {
        console.log(`[ActionExecutor] Timeout occurred for action: ${action.name}`);
        
        // Mark as executed to prevent it from executing later
        this.executedActions.add(action.id);
        
        // Stop observing for this action
        if (this.observers.has(action.id)) {
            this.observers.get(action.id).disconnect();
            this.observers.delete(action.id);
        }
        
        // Execute next action in the chain if specified
        if (action.nextActionId) {
            console.log(`[ActionExecutor] Timeout - chaining to next action: ${action.nextActionId}`);
            this.executeNextAction(action.nextActionId);
        } else {
            console.log(`[ActionExecutor] No next action specified for timed out action: ${action.name}`);
        }
    }
    
    /**
     * Execute the next action in the chain
     * @param {string} nextActionId - ID of the next action to execute
     */
    executeNextAction(nextActionId) {
        const nextAction = this.actions.find(a => a.id === nextActionId);
        
        if (!nextAction) {
            console.warn(`[ActionExecutor] Next action not found: ${nextActionId}`);
            return;
        }
        
        if (this.executedActions.has(nextActionId)) {
            console.log(`[ActionExecutor] Next action already executed: ${nextAction.name}`);
            return;
        }
        
        console.log(`[ActionExecutor] Executing next action in chain: ${nextAction.name}`);
        
        // Execute based on trigger type
        if (nextAction.trigger.type === 'immediate') {
            // Execute immediate actions right away
            this.executeAction(nextAction, null);
        } else if (nextAction.trigger.type === 'elementVisible') {
            // For element-based triggers, check if element already exists
            const element = this.findElement(nextAction.trigger);
            if (element && this.isElementVisible(element)) {
                console.log(`[ActionExecutor] Element already visible for next action: ${nextAction.name}`);
                this.executeAction(nextAction, element);
            } else {
                // Start monitoring for the element
                console.log(`[ActionExecutor] Starting to monitor for element in next action: ${nextAction.name}`);
                this.createObserverForAction(nextAction);
            }
        }
    }
    
    /**
     * Clear timeout for a specific action
     * @param {string} actionId - ID of the action
     */
    clearTimeout(actionId) {
        if (this.timeouts.has(actionId)) {
            clearTimeout(this.timeouts.get(actionId));
            this.timeouts.delete(actionId);
            console.log(`[ActionExecutor] Cleared timeout for action: ${actionId}`);
        }
    }
    
    /**
     * Clear all timeouts
     */
    clearAllTimeouts() {
        this.timeouts.forEach((timeoutId, actionId) => {
            clearTimeout(timeoutId);
            console.log(`[ActionExecutor] Cleared timeout for action: ${actionId}`);
        });
        this.timeouts.clear();
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
