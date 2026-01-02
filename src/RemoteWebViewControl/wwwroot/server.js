let connection = null;
let clientName = '';

// Action Builder variables
let allActions = [];
let editingActionId = null;
let currentStepIndex = 0; // Current step being edited in the Actions array
let importedActionsData = null; // Temporarily store imported multi-step actions
let actionBuilderModal = null;
let deleteActionModal = null;
let actionToDelete = null;

// Mouse click simulation
let mouseClickModal = null;
let displayWidth = null;
let displayHeight = null;

// Logs functionality
let logsModal = null;
let logMessages = [];

// Playlist variables
let isPlaylistMode = false;
let playlistActions = [];
let currentPlaylistIndex = 0;
let playlistTimer = null;
let playlistTimeRemaining = 0;

// Get client name from URL path
function getClientNameFromUrl() {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    // Path should be /server/<client-name>
    if (pathParts.length >= 2 && pathParts[0] === 'server') {
        return decodeURIComponent(pathParts[1]);
    }
    return null;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    clientName = getClientNameFromUrl();
    
    if (!clientName) {
        window.location.href = '/admin?error=' + encodeURIComponent('No client specified');
        return;
    }

    document.getElementById('clientNameDisplay').textContent = clientName;
    
    // Setup all event listeners after DOM is ready
    setupEventListeners();
    
    await connectToHub();
});

function setupEventListeners() {
    document.getElementById('btnSendUrl').addEventListener('click', sendUrl);
    document.getElementById('btnExecuteScript').addEventListener('click', executeScript);

    document.getElementById('urlInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendUrl();
    });

    // Quick script buttons
    document.querySelectorAll('.quick-script').forEach(btn => {
        btn.addEventListener('click', async () => {
            const script = btn.dataset.script;
            try {
                await connection.invoke('ExecuteScriptOnClient', clientName, script);
                showConfirmation('Script executed!');
            } catch (error) {
                console.error('Error executing script:', error);
                alert('Failed to execute script.');
            }
        });
    });

    document.getElementById('btnSimulateClick').addEventListener('click', () => {
        if (!mouseClickModal) {
            mouseClickModal = new bootstrap.Modal(document.getElementById('mouseClickModal'));
        }
        mouseClickModal.show();
    });

    // New Action button
    document.getElementById('btnNewAction').addEventListener('click', () => {
        if (!actionBuilderModal) {
            actionBuilderModal = new bootstrap.Modal(document.getElementById('actionBuilderModal'));
        }
        resetActionForm();
        actionBuilderModal.show();
    });

    // Import Action button
    document.getElementById('btnImportAction').addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const importedData = JSON.parse(text);
                
                // Validate the imported data
                if (!importedData.name || !importedData.targetUrl) {
                    alert('Invalid action JSON: missing required fields (name, targetUrl)');
                    return;
                }
                
                // Open the action builder modal with the imported data
                if (!actionBuilderModal) {
                    actionBuilderModal = new bootstrap.Modal(document.getElementById('actionBuilderModal'));
                }
                
                resetActionForm();
                
                // Store all imported actions for use when saving
                importedActionsData = importedData.actions || [];
                
                // Populate the form with imported data
                document.getElementById('actionName').value = importedData.name;
                document.getElementById('actionTargetUrl').value = importedData.targetUrl;
                document.getElementById('actionDescription').value = importedData.description || '';
                document.getElementById('isActive').checked = importedData.isActive !== false;
                document.getElementById('runTimeInSeconds').value = importedData.runTimeInSeconds || 120;
                
                // Load the first step if available
                if (importedActionsData.length > 0) {
                    const step = importedActionsData[0];
                    
                    // Set trigger type
                    const triggerType = step.trigger?.type === 'immediate' ? 'none' : 'element';
                    document.getElementById(triggerType === 'none' ? 'triggerNone' : 'triggerElement').checked = true;
                    document.querySelector('input[name="triggerType"]:checked').dispatchEvent(new Event('change'));
                    
                    if (triggerType === 'element' && step.trigger) {
                        document.getElementById('elementType').value = step.trigger.elementType || 'div';
                        document.getElementById('elementSelector').value = step.trigger.selector || '';
                        document.getElementById('timeoutSeconds').value = step.trigger.timeoutSeconds || 0;
                    }
                    
                    // Set action
                    if (step.action) {
                        document.getElementById('delaySeconds').value = step.action.delaySeconds || 0;
                        
                        if (triggerType === 'none') {
                            // Quick action
                            if (step.action.type === 'script' && step.action.script === 'document.documentElement.requestFullscreen()') {
                                document.getElementById('quickActionType').value = 'fullscreen';
                            } else if (step.action.type === 'navigate' && !step.action.url) {
                                document.getElementById('quickActionType').value = 'none';
                            }
                        } else {
                            // Standard action
                            document.getElementById('actionType').value = step.action.type || 'click';
                            document.getElementById('actionType').dispatchEvent(new Event('change'));
                            
                            if (step.action.type === 'click') {
                                document.getElementById('actionClickX').value = step.action.clickX || 100;
                                document.getElementById('actionClickY').value = step.action.clickY || 100;
                            } else if (step.action.type === 'navigate') {
                                document.getElementById('navigateUrl').value = step.action.url || '';
                            }
                        }
                    }
                }
                
                // Update the JSON editor with the full imported data (all steps)
                const jsonEditor = document.getElementById('actionJsonEditor');
                jsonEditor.value = JSON.stringify(importedData, null, 2);
                
                // Update navigation buttons to enable Next/Previous if multiple steps
                updateNavigationButtons();
                updateStepCounter();
                
                showConfirmation(`Imported action: ${importedData.name}`);
                actionBuilderModal.show();
                
            } catch (error) {
                console.error('Error importing action:', error);
                alert(`Failed to import action: ${error.message}`);
            } finally {
                document.body.removeChild(fileInput);
            }
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
    });

    // Add Step button
    document.getElementById('btnAddStep').addEventListener('click', async () => {
        await addStep();
    });

    // Previous Step button
    document.getElementById('btnPrevAction').addEventListener('click', () => {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            loadStepIntoForm(currentStepIndex);
        }
    });

    // Next Step button
    document.getElementById('btnNextAction').addEventListener('click', () => {
        let actionsArray = null;
        
        if (editingActionId) {
            const action = allActions.find(a => a.id === editingActionId);
            actionsArray = action?.actions;
        } else if (importedActionsData) {
            actionsArray = importedActionsData;
        }
        
        if (actionsArray && currentStepIndex < actionsArray.length - 1) {
            currentStepIndex++;
            loadStepIntoForm(currentStepIndex);
        }
    });

    // Cancel Edit button
    document.getElementById('btnCancelEdit').addEventListener('click', () => {
        resetActionForm();
        if (actionBuilderModal) {
            actionBuilderModal.hide();
        }
    });

    // Action Launcher and dropdown change handler
    document.getElementById('btnLaunchAction').addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.action-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        // Get selected actions
        const selectedActions = Array.from(checkboxes).map(cb => {
            const actionId = cb.id.replace('action-', '');
            return allActions.find(a => a.id === actionId);
        }).filter(a => a);
        
        if (selectedActions.length === 1) {
            // Launch single action immediately
            const action = selectedActions[0];
            try {
                await connection.invoke('SendUrlToClient', clientName, action.targetUrl);
                showConfirmation(`Launched: ${action.name}`);
            } catch (error) {
                console.error('Error launching action:', error);
                alert('Failed to launch action');
            }
        } else {
            // Multiple actions - show confirmation
            const actionNames = selectedActions.map(a => a.name).join(', ');
            if (confirm(`Launch ${selectedActions.length} actions sequentially?\n\n${actionNames}`)) {
                for (const action of selectedActions) {
                    try {
                        await connection.invoke('SendUrlToClient', clientName, action.targetUrl);
                        showConfirmation(`Launched: ${action.name}`);
                        // Small delay between launches
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error('Error launching action:', error);
                    }
                }
            }
        }
    });
    
    // Start Playlist button
    document.getElementById('btnStartPlaylist').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.action-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        // Get selected actions
        playlistActions = Array.from(checkboxes).map(cb => {
            const actionId = cb.id.replace('action-', '');
            return allActions.find(a => a.id === actionId);
        }).filter(a => a);
        
        if (playlistActions.length > 0) {
            startPlaylist();
        }
    });
    
    // Exit Playlist button
    document.getElementById('btnExitPlaylist').addEventListener('click', () => {
        exitPlaylist();
    });

    // Action Builder form handlers
    document.querySelectorAll('input[name="triggerType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const triggerType = e.target.value;
            const elementConfig = document.getElementById('elementTriggerConfig');
            const quickActionSelection = document.getElementById('quickActionSelection');
            const standardActionSelection = document.getElementById('standardActionSelection');
            const elementType = document.getElementById('elementType');
            const elementSelector = document.getElementById('elementSelector');
            
            if (triggerType === 'none') {
                // Hide element configuration
                elementConfig.style.display = 'none';
                elementType.required = false;
                elementSelector.required = false;
                
                // Show quick action selection
                quickActionSelection.style.display = 'block';
                standardActionSelection.style.display = 'none';
            } else {
                // Show element configuration
                elementConfig.style.display = 'block';
                elementType.required = true;
                elementSelector.required = true;
                
                // Hide quick action selection
                quickActionSelection.style.display = 'none';
                standardActionSelection.style.display = 'block';
            }
        });
    });

    document.getElementById('actionType').addEventListener('change', (e) => {
        const urlContainer = document.getElementById('navigateUrlContainer');
        const urlInput = document.getElementById('navigateUrl');
        const coordContainer = document.getElementById('clickCoordinatesContainer');
        const clickX = document.getElementById('actionClickX');
        const clickY = document.getElementById('actionClickY');
        
        if (e.target.value === 'navigate') {
            urlContainer.style.display = 'block';
            urlInput.required = true;
            coordContainer.style.display = 'none';
            clickX.required = false;
            clickY.required = false;
        } else {
            urlContainer.style.display = 'none';
            urlInput.required = false;
            coordContainer.style.display = 'block';
            clickX.required = true;
            clickY.required = true;
        }
    });

    document.getElementById('actionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveAction();
    });

    // Reset form when modal is closed
    document.getElementById('actionBuilderModal').addEventListener('hidden.bs.modal', () => {
        resetActionForm();
    });

    document.getElementById('btnConfirmDeleteAction').addEventListener('click', async () => {
        if (actionToDelete) {
            await deleteAction(actionToDelete);
            deleteActionModal.hide();
            actionToDelete = null;
        }
    });

    document.getElementById('btnSendClick').addEventListener('click', async () => {
        const x = parseInt(document.getElementById('clickX').value);
        const y = parseInt(document.getElementById('clickY').value);
        
        if (isNaN(x) || isNaN(y) || x < 0 || y < 0) {
            alert('Please enter valid coordinates (positive numbers)');
            return;
        }

        // Validate against display dimensions if available
        if (displayWidth !== null && displayHeight !== null) {
            if (x >= displayWidth || y >= displayHeight) {
                alert(`Coordinates out of bounds!\nMax X: ${displayWidth - 1}, Max Y: ${displayHeight - 1}`);
                return;
            }
        }

        try {
            await connection.invoke('SimulateMouseClick', clientName, x, y);
            mouseClickModal.hide();
            showConfirmation(`Mouse click sent at (${x}, ${y})`);
        } catch (error) {
            console.error('Error sending mouse click:', error);
            alert('Failed to send mouse click.');
        }
    });

    // Allow Enter key to submit in modal
    document.getElementById('mouseClickModal').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btnSendClick').click();
        }
    });

    document.getElementById('btnViewLogs').addEventListener('click', () => {
        if (!logsModal) {
            logsModal = new bootstrap.Modal(document.getElementById('logsModal'));
        }
        logsModal.show();
    });

    document.getElementById('btnClearLogs').addEventListener('click', () => {
        logMessages = [];
        document.getElementById('logsContainer').innerHTML = '<div class="text-muted text-center">No logs yet...</div>';
        document.getElementById('logCount').textContent = '0';
    });

    // JSON Tab functionality
    const formTab = document.getElementById('form-tab');
    const jsonTab = document.getElementById('json-tab');
    const jsonEditor = document.getElementById('actionJsonEditor');
    
    // When switching to JSON tab, sync from form to JSON
    jsonTab.addEventListener('shown.bs.tab', () => {
        // Don't sync if we have imported data - preserve the full imported JSON
        if (!importedActionsData || importedActionsData.length === 0) {
            syncFormToJson();
        }
    });
    
    // When switching to Form tab, sync from JSON to form
    formTab.addEventListener('shown.bs.tab', () => {
        syncJsonToForm();
    });
    
    // Format JSON button
    document.getElementById('btnFormatJson').addEventListener('click', () => {
        try {
            const json = JSON.parse(jsonEditor.value);
            jsonEditor.value = JSON.stringify(json, null, 2);
            hideJsonError();
        } catch (e) {
            showJsonError('Invalid JSON: ' + e.message);
        }
    });
    
    // Real-time JSON validation (debounced)
    let jsonValidationTimeout;
    jsonEditor.addEventListener('input', () => {
        clearTimeout(jsonValidationTimeout);
        jsonValidationTimeout = setTimeout(() => {
            try {
                JSON.parse(jsonEditor.value);
                hideJsonError();
            } catch (e) {
                showJsonError('Invalid JSON: ' + e.message);
            }
        }, 500);
    });
}


async function loadActions() {
    try {
        const response = await fetch(`/api/actions/${clientName}`);
        if (response.ok) {
            allActions = await response.json();
            displayActions();
            renderActionsGrid();
        }
    } catch (error) {
        console.error('Error loading actions:', error);
    }
}

function renderActionsGrid() {
    const grid = document.getElementById('actionsGrid');
    const btnStartPlaylist = document.getElementById('btnStartPlaylist');
    const btnLaunchAction = document.getElementById('btnLaunchAction');
    
    if (!allActions || allActions.length === 0) {
        grid.innerHTML = '<div class="text-muted text-center p-3">No actions available</div>';
        btnStartPlaylist.disabled = true;
        btnLaunchAction.disabled = true;
        return;
    }
    
    grid.innerHTML = '';
    
    // If in playlist mode, show simple list instead of tiles
    if (isPlaylistMode) {
        grid.className = 'playlist-list';
        
        playlistActions.forEach((action, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            if (index === currentPlaylistIndex) {
                item.classList.add('active');
            }
            
            const number = document.createElement('span');
            number.className = 'playlist-number';
            number.textContent = index + 1;
            
            const name = document.createElement('span');
            name.className = 'playlist-name';
            name.textContent = action.name;
            
            const runtime = document.createElement('span');
            runtime.className = 'playlist-runtime';
            runtime.textContent = `${action.runTimeInSeconds || 120}s`;
            
            item.appendChild(number);
            item.appendChild(name);
            item.appendChild(runtime);
            
            grid.appendChild(item);
        });
        
        return;
    }
    
    // Normal mode - show grid tiles
    grid.className = 'actions-grid';
    
    allActions.forEach(action => {
        const tile = document.createElement('div');
        tile.className = 'action-tile';
        tile.dataset.actionId = action.id;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'action-checkbox';
        checkbox.id = `action-${action.id}`;
        checkbox.disabled = isPlaylistMode;
        
        const label = document.createElement('label');
        label.className = 'action-tile-content';
        label.htmlFor = `action-${action.id}`;
        
        const name = document.createElement('div');
        name.className = 'action-name';
        name.textContent = action.name;
        
        const url = document.createElement('div');
        url.className = 'action-url';
        url.textContent = action.targetUrl;
        
        const runtime = document.createElement('div');
        runtime.className = 'action-runtime';
        runtime.innerHTML = `<i class="bi bi-stopwatch"></i> ${action.runTimeInSeconds || 120}s`;
        
        const actions = document.createElement('div');
        actions.className = 'action-buttons';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-secondary';
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.title = 'Edit';
        editBtn.disabled = isPlaylistMode;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editAction(action.id, 0);
            if (!actionBuilderModal) {
                actionBuilderModal = new bootstrap.Modal(document.getElementById('actionBuilderModal'));
            }
            actionBuilderModal.show();
        };
        
        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn btn-sm btn-outline-primary';
        exportBtn.innerHTML = '<i class="bi bi-download"></i>';
        exportBtn.title = 'Export';
        exportBtn.disabled = isPlaylistMode;
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            exportAction(action);
        };
        
        const cloneBtn = document.createElement('button');
        cloneBtn.className = 'btn btn-sm btn-outline-info';
        cloneBtn.innerHTML = '<i class="bi bi-files"></i>';
        cloneBtn.title = 'Clone';
        cloneBtn.disabled = isPlaylistMode;
        cloneBtn.onclick = async (e) => {
            e.stopPropagation();
            await cloneAction(action);
            if (!actionBuilderModal) {
                actionBuilderModal = new bootstrap.Modal(document.getElementById('actionBuilderModal'));
            }
            actionBuilderModal.show();
        };
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.title = 'Delete';
        deleteBtn.disabled = isPlaylistMode;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            confirmDeleteAction(action.id, action.name);
        };
        
        actions.appendChild(editBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(cloneBtn);
        actions.appendChild(deleteBtn);
        
        label.appendChild(name);
        label.appendChild(url);
        label.appendChild(runtime);
        
        tile.appendChild(checkbox);
        tile.appendChild(label);
        tile.appendChild(actions);
        
        // Handle tile click to toggle checkbox
        tile.addEventListener('click', (e) => {
            if (!isPlaylistMode && e.target !== checkbox && !actions.contains(e.target)) {
                checkbox.checked = !checkbox.checked;
                updatePlaylistButtons();
            }
        });
        
        checkbox.addEventListener('change', updatePlaylistButtons);
        
        grid.appendChild(tile);
    });
    
    updatePlaylistButtons();
}

function updatePlaylistButtons() {
    const checkboxes = document.querySelectorAll('.action-checkbox');
    const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    document.getElementById('btnStartPlaylist').disabled = selectedCount === 0 || isPlaylistMode;
    document.getElementById('btnLaunchAction').disabled = selectedCount === 0 || isPlaylistMode;
}

function populateActionDropdown() {
    // This function is deprecated but kept for backward compatibility
    // Actions are now shown in the grid
}

function displayActions() {
    // This function is no longer needed for modal display
    // but we keep it for backward compatibility
    // Actions are now managed through the dropdown and action buttons
}

async function saveAction(closeModal = true) {
    const clickXValue = document.getElementById('actionClickX').value;
    const clickYValue = document.getElementById('actionClickY').value;
    const triggerType = document.querySelector('input[name="triggerType"]:checked').value;
    
    // Build the current step
    const currentStep = {
        trigger: {
            type: triggerType === 'none' ? 'immediate' : 'elementVisible',
            elementType: triggerType === 'element' ? document.getElementById('elementType').value : null,
            selector: triggerType === 'element' ? document.getElementById('elementSelector').value : null,
            timeoutSeconds: triggerType === 'element' ? (parseFloat(document.getElementById('timeoutSeconds').value) || 0) : 0
        },
        action: {}
    };
    
    // Handle action based on trigger type
    if (triggerType === 'none') {
        const quickAction = document.getElementById('quickActionType').value;
        if (quickAction === 'fullscreen') {
            currentStep.action = {
                type: 'script',
                script: 'document.documentElement.requestFullscreen()',
                delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
            };
        } else if (quickAction === 'none') {
            // None option - no action needed, just navigate to the page
            currentStep.action = {
                type: 'navigate',
                url: null,
                delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
            };
        }
    } else {
        const actionType = document.getElementById('actionType').value;
        currentStep.action = {
            type: actionType,
            clickX: actionType === 'click' ? parseInt(clickXValue) : null,
            clickY: actionType === 'click' ? parseInt(clickYValue) : null,
            url: actionType === 'navigate' ? document.getElementById('navigateUrl').value : null,
            delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
        };
    }
    
    let actionData;
    
    if (editingActionId) {
        // Editing existing action - update the step at currentStepIndex
        const existingAction = allActions.find(a => a.id === editingActionId);
        actionData = {
            name: document.getElementById('actionName').value,
            targetUrl: document.getElementById('actionTargetUrl').value,
            description: document.getElementById('actionDescription').value,
            isActive: document.getElementById('isActive').checked,
            runTimeInSeconds: parseInt(document.getElementById('runTimeInSeconds').value) || 120,
            actions: existingAction?.actions || []
        };
        
        // Update or add the step
        if (currentStepIndex < actionData.actions.length) {
            actionData.actions[currentStepIndex] = currentStep;
        } else {
            actionData.actions.push(currentStep);
        }
    } else {
        // Creating new action
        actionData = {
            name: document.getElementById('actionName').value,
            targetUrl: document.getElementById('actionTargetUrl').value,
            description: document.getElementById('actionDescription').value,
            isActive: document.getElementById('isActive').checked,
            runTimeInSeconds: parseInt(document.getElementById('runTimeInSeconds').value) || 120,
            actions: importedActionsData && importedActionsData.length > 0 ? importedActionsData : [currentStep]
        };
    }

    console.log('Sending action data:', JSON.stringify(actionData, null, 2));

    try {
        let response;
        if (editingActionId) {
            response = await fetch(`/api/actions/${clientName}/${editingActionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actionData)
            });
        } else {
            response = await fetch(`/api/actions/${clientName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actionData)
            });
        }

        if (response.ok) {
            const savedAction = await response.json();
            editingActionId = savedAction.id; // Update in case it was a new action
            
            // Clear imported data after successful save
            if (importedActionsData && importedActionsData.length > 0) {
                importedActionsData = null;
            }
            
            await loadActions();
            await notifyClientOfActions();
            renderActionsGrid();
            showConfirmation('Action saved successfully!');
            
            // Update navigation buttons
            updateNavigationButtons();
            
            // Close the modal only if requested
            if (closeModal && actionBuilderModal) {
                actionBuilderModal.hide();
            }
        } else {
            alert('Failed to save action');
        }
    } catch (error) {
        console.error('Error saving action:', error);
        alert('Failed to save action');
    }
}

// Load a step into the form (works for both editing and imported data)
function loadStepIntoForm(stepIndex) {
    let step = null;
    let actionName = '';
    let targetUrl = '';
    let description = '';
    let isActive = true;
    let runTimeInSeconds = 120;
    
    // Get step from editing action or imported data
    if (editingActionId) {
        const action = allActions.find(a => a.id === editingActionId);
        if (action && action.actions && action.actions[stepIndex]) {
            step = action.actions[stepIndex];
            actionName = action.name;
            targetUrl = action.targetUrl || '';
            description = action.description || '';
            isActive = action.isActive;
            runTimeInSeconds = action.runTimeInSeconds || 120;
        }
    } else if (importedActionsData && importedActionsData[stepIndex]) {
        step = importedActionsData[stepIndex];
        // Keep existing form values for name, url, etc.
        actionName = document.getElementById('actionName').value;
        targetUrl = document.getElementById('actionTargetUrl').value;
        description = document.getElementById('actionDescription').value;
        isActive = document.getElementById('isActive').checked;
        runTimeInSeconds = parseInt(document.getElementById('runTimeInSeconds').value) || 120;
    }
    
    if (!step) {
        console.error('No step found at index', stepIndex);
        return;
    }
    
    currentStepIndex = stepIndex;
    
    // Update form with step data
    document.getElementById('actionName').value = actionName;
    document.getElementById('actionTargetUrl').value = targetUrl;
    document.getElementById('actionDescription').value = description;
    document.getElementById('isActive').checked = isActive;
    document.getElementById('runTimeInSeconds').value = runTimeInSeconds;
    
    // Set trigger and action from the step
    const triggerType = step.trigger?.type === 'immediate' ? 'none' : 'element';
    document.getElementById(triggerType === 'none' ? 'triggerNone' : 'triggerElement').checked = true;
    document.querySelector('input[name="triggerType"]:checked').dispatchEvent(new Event('change'));
    
    document.getElementById('timeoutSeconds').value = step.trigger?.timeoutSeconds || 0;
    document.getElementById('delaySeconds').value = step.action?.delaySeconds || 0;
    
    if (triggerType === 'element') {
        document.getElementById('elementType').value = step.trigger.elementType || 'div';
        document.getElementById('elementSelector').value = step.trigger.selector || '';
        document.getElementById('actionType').value = step.action?.type || 'click';
        
        const clickXInput = document.getElementById('actionClickX');
        const clickYInput = document.getElementById('actionClickY');
        clickXInput.value = step.action?.clickX ?? 100;
        clickYInput.value = step.action?.clickY ?? 100;
        
        document.getElementById('navigateUrl').value = step.action?.url || '';
        document.getElementById('actionType').dispatchEvent(new Event('change'));
    } else {
        if (step.action?.type === 'script' && step.action.script === 'document.documentElement.requestFullscreen()') {
            document.getElementById('quickActionType').value = 'fullscreen';
        } else if (step.action?.type === 'navigate' && !step.action.url) {
            document.getElementById('quickActionType').value = 'none';
        }
    }
    
    // Update step counter and navigation
    updateStepCounter();
    updateNavigationButtons();
}

function editAction(actionId, stepIndex = 0) {
    const action = allActions.find(a => a.id === actionId);
    if (!action) return;

    console.log('Editing action:', action, 'Step:', stepIndex);

    editingActionId = actionId;
    currentStepIndex = stepIndex;

    // Set top-level action properties
    document.getElementById('actionName').value = action.name;
    document.getElementById('actionTargetUrl').value = action.targetUrl || '';
    document.getElementById('actionDescription').value = action.description || '';
    document.getElementById('isActive').checked = action.isActive;
    document.getElementById('runTimeInSeconds').value = action.runTimeInSeconds || 120;
    
    // Get the step to edit (or use legacy format)
    let step;
    if (action.actions && action.actions.length > 0) {
        step = action.actions[stepIndex] || action.actions[0];
    } else if (action.trigger && action.action) {
        // Legacy format
        step = {
            trigger: action.trigger,
            action: action.action
        };
    } else {
        console.error('No action steps found');
        return;
    }
    
    // Set trigger and action from the step
    const triggerType = step.trigger.type === 'immediate' ? 'none' : 'element';
    document.getElementById(triggerType === 'none' ? 'triggerNone' : 'triggerElement').checked = true;
    document.querySelector(`input[name="triggerType"]:checked`).dispatchEvent(new Event('change'));
    
    document.getElementById('timeoutSeconds').value = step.trigger?.timeoutSeconds || 0;
    document.getElementById('delaySeconds').value = step.action?.delaySeconds || 0;
    
    if (triggerType === 'element') {
        document.getElementById('elementType').value = step.trigger.elementType || 'div';
        document.getElementById('elementSelector').value = step.trigger.selector || '';
        document.getElementById('actionType').value = step.action.type;
        
        const clickXInput = document.getElementById('actionClickX');
        const clickYInput = document.getElementById('actionClickY');
        clickXInput.value = step.action.clickX ?? 100;
        clickYInput.value = step.action.clickY ?? 100;
        
        document.getElementById('navigateUrl').value = step.action.url || '';
        document.getElementById('actionType').dispatchEvent(new Event('change'));
    } else {
        if (step.action.type === 'script' && step.action.script === 'document.documentElement.requestFullscreen()') {
            document.getElementById('quickActionType').value = 'fullscreen';
        } else if (step.action.type === 'navigate' && !step.action.url) {
            document.getElementById('quickActionType').value = 'none';
        }
    }

    document.getElementById('actionFormTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Action';
    document.getElementById('btnSaveText').textContent = 'Save Step';
    document.getElementById('btnCancelEdit').style.display = 'block';
    
    // Update step counter and navigation
    updateStepCounter();
    updateNavigationButtons();
}

async function toggleAction(actionId, isActive) {
    try {
        const response = await fetch(`/api/actions/${clientName}/${actionId}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        if (response.ok) {
            await loadActions();
            await notifyClientOfActions();
            populateActionDropdown();
            showConfirmation(`Action ${isActive ? 'activated' : 'deactivated'}`);
        }
    } catch (error) {
        console.error('Error toggling action:', error);
    }
}

function exportAction(action) {
    try {
        // Create a clean copy of the action for export (remove id)
        const exportData = {
            name: action.name,
            targetUrl: action.targetUrl,
            description: action.description,
            isActive: action.isActive,
            runTimeInSeconds: action.runTimeInSeconds || 120,
            actions: action.actions
        };
        
        // Convert to JSON with pretty formatting
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Create a blob and download link
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create a temporary download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `${action.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showConfirmation(`Exported: ${action.name}`);
    } catch (error) {
        console.error('Error exporting action:', error);
        alert(`Failed to export action: ${error.message}`);
    }
}

async function cloneAction(action) {
    try {
        // Reset the form for a new action
        resetActionForm();
        
        // Populate with the action's data
        document.getElementById('actionName').value = `${action.name} (Copy)`;
        document.getElementById('actionTargetUrl').value = action.targetUrl || '';
        document.getElementById('actionDescription').value = action.description || '';
        document.getElementById('isActive').checked = action.isActive;
        document.getElementById('runTimeInSeconds').value = action.runTimeInSeconds || 120;
        
        // Get the first step to populate (or use legacy format)
        let step;
        if (action.actions && action.actions.length > 0) {
            step = action.actions[0];
        } else if (action.trigger && action.action) {
            // Legacy format
            step = {
                trigger: action.trigger,
                action: action.action
            };
        }
        
        if (step) {
            // Set trigger and action from the step
            const triggerType = step.trigger.type === 'immediate' ? 'none' : 'element';
            document.getElementById(triggerType === 'none' ? 'triggerNone' : 'triggerElement').checked = true;
            document.querySelector(`input[name="triggerType"]:checked`).dispatchEvent(new Event('change'));
            
            document.getElementById('timeoutSeconds').value = step.trigger?.timeoutSeconds || 0;
            document.getElementById('delaySeconds').value = step.action?.delaySeconds || 0;
            
            if (triggerType === 'element') {
                document.getElementById('elementType').value = step.trigger.elementType || 'div';
                document.getElementById('elementSelector').value = step.trigger.selector || '';
                document.getElementById('actionType').value = step.action.type;
                
                const clickXInput = document.getElementById('actionClickX');
                const clickYInput = document.getElementById('actionClickY');
                clickXInput.value = step.action.clickX ?? 100;
                clickYInput.value = step.action.clickY ?? 100;
                
                document.getElementById('navigateUrl').value = step.action.url || '';
                document.getElementById('actionType').dispatchEvent(new Event('change'));
            } else {
                if (step.action.type === 'script' && step.action.script === 'document.documentElement.requestFullscreen()') {
                    document.getElementById('quickActionType').value = 'fullscreen';
                } else if (step.action.type === 'navigate' && !step.action.url) {
                    document.getElementById('quickActionType').value = 'none';
                }
            }
        }
        
        // Set title to indicate this is cloning
        document.getElementById('actionFormTitle').innerHTML = '<i class="bi bi-files me-2"></i>Clone Action';
        document.getElementById('btnSaveText').textContent = 'Create Action';
        
        // Store the action being cloned for multi-step support
        if (action.actions && action.actions.length > 1) {
            window.clonedActionSteps = JSON.parse(JSON.stringify(action.actions));
        }
        
        // Open the modal
        if (!actionBuilderModal) {
            actionBuilderModal = new bootstrap.Modal(document.getElementById('actionBuilderModal'));
        }
        actionBuilderModal.show();
    } catch (error) {
        console.error('Error cloning action:', error);
        alert('Failed to open clone dialog');
    }
}

function confirmDeleteAction(actionId, actionName) {
    if (!deleteActionModal) {
        deleteActionModal = new bootstrap.Modal(document.getElementById('deleteActionModal'));
    }
    actionToDelete = actionId;
    document.getElementById('deleteActionName').textContent = actionName;
    deleteActionModal.show();
}

async function deleteAction(actionId) {
    try {
        const response = await fetch(`/api/actions/${clientName}/${actionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadActions();
            await notifyClientOfActions();
            populateActionDropdown();
            showConfirmation('Action deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting action:', error);
    }
}

function resetActionForm() {
    document.getElementById('actionForm').reset();
    document.getElementById('navigateUrlContainer').style.display = 'none';
    document.getElementById('actionFormTitle').innerHTML = '<i class="bi bi-plus-circle me-2"></i>Create New Action';
    document.getElementById('btnSaveText').textContent = 'Create Action';
    document.getElementById('btnCancelEdit').style.display = 'none';
    editingActionId = null;
    currentStepIndex = 0;
    importedActionsData = null; // Clear any imported data
    window.chainFromActionId = null;
    
    // Unlock target URL field
    document.getElementById('actionTargetUrl').readOnly = false;
    document.getElementById('actionTargetUrl').classList.remove('bg-light');
    
    // Reset trigger type to element visible (default)
    document.getElementById('triggerElement').checked = true;
    document.getElementById('elementTriggerConfig').style.display = 'block';
    document.getElementById('quickActionSelection').style.display = 'none';
    document.getElementById('standardActionSelection').style.display = 'block';
    
    // Reset timeout
    document.getElementById('timeoutSeconds').value = 0;
    
    // Reset navigation buttons and counter
    document.getElementById('btnPrevAction').disabled = true;
    document.getElementById('btnNextAction').disabled = true;
    document.getElementById('stepCounter').style.display = 'none';
}

// Update step counter display
function updateStepCounter() {
    const counter = document.getElementById('stepCounter');
    let actionsArray = null;
    
    // Check if we're editing an existing action
    if (editingActionId) {
        const action = allActions.find(a => a.id === editingActionId);
        if (action && action.actions) {
            actionsArray = action.actions;
        }
    }
    // Check if we have imported data
    else if (importedActionsData && importedActionsData.length > 0) {
        actionsArray = importedActionsData;
    }
    
    if (actionsArray && actionsArray.length > 0) {
        counter.textContent = `(Step ${currentStepIndex + 1} of ${actionsArray.length})`;
        counter.style.display = 'inline';
    } else {
        counter.style.display = 'none';
    }
}

// Update navigation buttons based on current step
function updateNavigationButtons() {
    let actionsArray = null;
    
    // Check if we're editing an existing action
    if (editingActionId) {
        const action = allActions.find(a => a.id === editingActionId);
        if (action && action.actions) {
            actionsArray = action.actions;
        }
    }
    // Check if we have imported data
    else if (importedActionsData && importedActionsData.length > 0) {
        actionsArray = importedActionsData;
    }
    
    // If no actions available, disable both buttons
    if (!actionsArray || actionsArray.length === 0) {
        document.getElementById('btnPrevAction').disabled = true;
        document.getElementById('btnNextAction').disabled = true;
        return;
    }
    
    // Enable/disable Previous button
    const btnPrev = document.getElementById('btnPrevAction');
    btnPrev.disabled = currentStepIndex === 0;
    
    // Enable/disable Next button
    const btnNext = document.getElementById('btnNextAction');
    btnNext.disabled = currentStepIndex >= actionsArray.length - 1;
}

// Add a new step to the current action
async function addStep() {
    // Validate that we have at least basic info
    const actionName = document.getElementById('actionName').value;
    const targetUrl = document.getElementById('actionTargetUrl').value;
    
    if (!actionName || !targetUrl) {
        alert('Please fill in Action Name and Target URL first.');
        return;
    }
    
    // Save current step first (this will create the action if it's new) - but don't close modal
    await saveAction(false);
    
    // Move to new step (next index)
    const action = allActions.find(a => a.id === editingActionId);
    currentStepIndex = action && action.actions ? action.actions.length : 0;
    
    // Clear the form for new step (but keep action name/url/description)
    const name = document.getElementById('actionName').value;
    const url = document.getElementById('actionTargetUrl').value;
    const desc = document.getElementById('actionDescription').value;
    const isActive = document.getElementById('isActive').checked;
    
    document.getElementById('actionForm').reset();
    
    document.getElementById('actionName').value = name;
    document.getElementById('actionTargetUrl').value = url;
    document.getElementById('actionDescription').value = desc;
    document.getElementById('isActive').checked = isActive;
    
    // Reset to defaults
    document.getElementById('triggerElement').checked = true;
    document.querySelector('input[name="triggerType"]:checked').dispatchEvent(new Event('change'));
    document.getElementById('timeoutSeconds').value = 0;
    document.getElementById('delaySeconds').value = 0;
    
    document.getElementById('btnSaveText').textContent = 'Save Step';
    
    updateStepCounter();
    updateNavigationButtons();
}

async function notifyClientOfActions() {
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
        try {
            await connection.invoke('SendActionsToClient', clientName);
            console.log('Notified client of action changes');
        } catch (error) {
            console.error('Error notifying client:', error);
        }
    }
}

function addLogMessage(level, message, timestamp) {
    const logEntry = { level, message, timestamp: new Date(timestamp) };
    logMessages.push(logEntry);
    
    // Update log count badge
    document.getElementById('logCount').textContent = logMessages.length;
    
    // Format and add to container
    const container = document.getElementById('logsContainer');
    
    // Remove "no logs" message if this is the first log
    if (logMessages.length === 1) {
        container.innerHTML = '';
    }
    
    const logDiv = document.createElement('div');
    logDiv.className = 'mb-1';
    
    const levelColors = {
        'log': 'text-secondary',
        'info': 'text-info',
        'warn': 'text-warning',
        'error': 'text-danger'
    };
    
    const time = logEntry.timestamp.toLocaleTimeString();
    logDiv.innerHTML = `<span class="text-muted">[${time}]</span> <span class="${levelColors[level] || 'text-secondary'}">[${level.toUpperCase()}]</span> ${escapeHtml(message)}`;
    
    container.appendChild(logDiv);
    
    // Auto-scroll if enabled
    if (document.getElementById('autoScrollLogs').checked) {
        container.scrollTop = container.scrollHeight;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showConfirmation(message) {
    const confirmation = document.getElementById('actionConfirmation');
    document.getElementById('confirmationMessage').textContent = message;
    confirmation.classList.remove('d-none');
    setTimeout(() => confirmation.classList.add('d-none'), 3000);
}

async function sendUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) {
        alert('Please enter a URL');
        return;
    }

    try {
        await connection.invoke('SendUrlToClient', clientName, url);
        showConfirmation('URL sent successfully!');
    } catch (error) {
        console.error('Error sending URL:', error);
        alert('Failed to send URL. Please try again.');
    }
}

async function executeScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) {
        alert('Please enter a script');
        return;
    }

    try {
        await connection.invoke('ExecuteScriptOnClient', clientName, script);
        showConfirmation('Script executed!');
    } catch (error) {
        console.error('Error executing script:', error);
        alert('Failed to execute script. Please try again.');
    }
}

async function connectToHub() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl('/hub/remoteview', {
            transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling,
            skipNegotiation: false,
            timeout: 60000
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Information)
        .build();

    connection.on('ClientConnected', () => {
        console.log('ClientConnected event received - updating UI');
        document.getElementById('waitingAlert').classList.add('d-none');
        document.getElementById('waitingState').classList.add('d-none');
        document.getElementById('connectedState').classList.remove('d-none');
        document.getElementById('disconnectedState').classList.add('d-none');
        
        // Load actions to populate grid
        loadActions();
    });

    connection.on('ClientDisconnected', () => {
        document.getElementById('connectedState').classList.add('d-none');
        document.getElementById('disconnectedState').classList.remove('d-none');
    });

    connection.on('ReceiveLogMessage', (level, message, timestamp) => {
        addLogMessage(level, message, timestamp);
    });

    connection.on('ReceiveDisplayDimensions', (width, height) => {
        displayWidth = width;
        displayHeight = height;
        
        // Update modal display
        document.getElementById('displayWidth').textContent = width;
        document.getElementById('displayHeight').textContent = height;
        document.getElementById('dimensionsInfo').style.display = 'block';
        
        // Update input max attributes
        document.getElementById('clickX').setAttribute('max', width - 1);
        document.getElementById('clickY').setAttribute('max', height - 1);
        
        console.log(`Display dimensions received: ${width}x${height}`);
    });

    connection.on('ActionWasTriggered', (actionId, timestamp) => {
        console.log('Action triggered:', actionId, timestamp);
        // Reload actions to show updated lastTriggered time
        if (actionBuilderModal && actionBuilderModal._isShown) {
            loadActions();
        }
    });

    connection.on('ResetServer', () => {
        console.log('Reset signal received - redirecting to admin');
        window.location.href = '/admin';
    });

    // Handle reconnection events
    connection.onreconnecting((error) => {
        console.log('SignalR reconnecting...', error);
        document.getElementById('connectedState').classList.add('d-none');
        document.getElementById('disconnectedState').classList.remove('d-none');
    });

    connection.onreconnected(async (connectionId) => {
        console.log('SignalR reconnected with connection ID:', connectionId);
        try {
            // Rejoin the session after reconnection
            const success = await connection.invoke('ServerJoinSession', clientName);
            console.log('ServerJoinSession after reconnect result:', success);
            if (!success) {
                console.error('Failed to rejoin session after reconnection');
                window.location.href = '/admin?error=' + encodeURIComponent('Failed to rejoin session');
            }
        } catch (error) {
            console.error('Error rejoining session after reconnect:', error);
        }
    });

    connection.onclose((error) => {
        console.log('SignalR connection closed', error);
        document.getElementById('connectedState').classList.add('d-none');
        document.getElementById('disconnectedState').classList.remove('d-none');
    });

    try {
        console.log('Starting SignalR connection...');
        await connection.start();
        console.log('SignalR connection started successfully');
        
        // Ensure connection is in Connected state before invoking
        if (connection.state !== signalR.HubConnectionState.Connected) {
            console.warn('Connection started but not in Connected state, waiting...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const success = await connection.invoke('ServerJoinSession', clientName);
        console.log('ServerJoinSession result:', success);
        if (!success) {
            window.location.href = '/admin?error=' + encodeURIComponent('Client does not exist or is not connected');
        }
    } catch (error) {
        console.error('Error connecting to hub:', error);
        console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        // Don't show alert if it's a reconnect error - SignalR will handle it
        if (error.message && !error.message.includes('reconnecting')) {
            alert('Failed to connect: ' + error.message + '\n\nCheck browser console for details.');
        }
    }
}

// JSON Tab Synchronization Functions
function syncFormToJson() {
    const clickXValue = document.getElementById('actionClickX').value;
    const clickYValue = document.getElementById('actionClickY').value;
    const triggerType = document.querySelector('input[name="triggerType"]:checked').value;
    
    // Build the current step from form
    const currentStep = {
        trigger: {
            type: triggerType === 'none' ? 'immediate' : 'elementVisible',
            elementType: triggerType === 'element' ? document.getElementById('elementType').value : null,
            selector: triggerType === 'element' ? document.getElementById('elementSelector').value : null,
            timeoutSeconds: triggerType === 'element' ? (parseFloat(document.getElementById('timeoutSeconds').value) || 0) : 0
        },
        action: {}
    };
    
    // Handle action based on trigger type
    if (triggerType === 'none') {
        const quickAction = document.getElementById('quickActionType').value;
        if (quickAction === 'fullscreen') {
            currentStep.action = {
                type: 'script',
                script: 'document.documentElement.requestFullscreen()',
                delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
            };
        } else if (quickAction === 'none') {
            currentStep.action = {
                type: 'navigate',
                url: null,
                delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
            };
        }
    } else {
        const actionType = document.getElementById('actionType').value;
        currentStep.action = {
            type: actionType,
            clickX: actionType === 'click' ? parseInt(clickXValue) : null,
            clickY: actionType === 'click' ? parseInt(clickYValue) : null,
            url: actionType === 'navigate' ? document.getElementById('navigateUrl').value : null,
            delaySeconds: parseFloat(document.getElementById('delaySeconds').value) || 0
        };
    }
    
    let actionData;
    
    if (editingActionId) {
        // Editing existing action
        const existingAction = allActions.find(a => a.id === editingActionId);
        actionData = {
            id: editingActionId,
            name: document.getElementById('actionName').value,
            targetUrl: document.getElementById('actionTargetUrl').value,
            description: document.getElementById('actionDescription').value,
            isActive: document.getElementById('isActive').checked,
            actions: existingAction?.actions || []
        };
        
        // Update or add the step
        if (currentStepIndex < actionData.actions.length) {
            actionData.actions[currentStepIndex] = currentStep;
        } else {
            actionData.actions.push(currentStep);
        }
    } else {
        // Creating new action
        actionData = {
            name: document.getElementById('actionName').value,
            targetUrl: document.getElementById('actionTargetUrl').value,
            description: document.getElementById('actionDescription').value,
            isActive: document.getElementById('isActive').checked,
            actions: [currentStep]
        };
    }
    
    // Update JSON editor
    const jsonEditor = document.getElementById('actionJsonEditor');
    jsonEditor.value = JSON.stringify(actionData, null, 2);
    hideJsonError();
}

function syncJsonToForm() {
    const jsonEditor = document.getElementById('actionJsonEditor');
    
    try {
        const actionData = JSON.parse(jsonEditor.value);
        
        // Validate basic structure
        if (!actionData.name || !actionData.targetUrl || !actionData.actions || !Array.isArray(actionData.actions)) {
            showJsonError('Invalid action structure. Required fields: name, targetUrl, actions (array)');
            return;
        }
        
        // Update the action in memory if editing
        if (editingActionId) {
            const existingAction = allActions.find(a => a.id === editingActionId);
            if (existingAction) {
                Object.assign(existingAction, actionData);
            }
        }
        
        // Set top-level action properties
        document.getElementById('actionName').value = actionData.name || '';
        document.getElementById('actionTargetUrl').value = actionData.targetUrl || '';
        document.getElementById('actionDescription').value = actionData.description || '';
        document.getElementById('isActive').checked = actionData.isActive !== false;
        
        // Get the current step
        const step = actionData.actions[currentStepIndex] || actionData.actions[0];
        
        if (!step || !step.trigger || !step.action) {
            showJsonError('Invalid step structure at index ' + currentStepIndex);
            return;
        }
        
        // Set trigger type
        const triggerType = step.trigger.type === 'immediate' ? 'none' : 'element';
        document.getElementById(triggerType === 'none' ? 'triggerNone' : 'triggerElement').checked = true;
        document.querySelector('input[name="triggerType"]:checked').dispatchEvent(new Event('change'));
        
        // Set trigger properties
        document.getElementById('timeoutSeconds').value = step.trigger.timeoutSeconds || 0;
        
        if (triggerType === 'element') {
            document.getElementById('elementType').value = step.trigger.elementType || 'div';
            document.getElementById('elementSelector').value = step.trigger.selector || '';
            document.getElementById('actionType').value = step.action.type || 'click';
            
            document.getElementById('actionClickX').value = step.action.clickX ?? 100;
            document.getElementById('actionClickY').value = step.action.clickY ?? 100;
            document.getElementById('navigateUrl').value = step.action.url || '';
            
            document.getElementById('actionType').dispatchEvent(new Event('change'));
        } else {
            // Immediate trigger - check for quick actions
            if (step.action.type === 'script' && step.action.script === 'document.documentElement.requestFullscreen()') {
                document.getElementById('quickActionType').value = 'fullscreen';
            } else if (step.action.type === 'navigate' && !step.action.url) {
                document.getElementById('quickActionType').value = 'none';
            }
        }
        
        document.getElementById('delaySeconds').value = step.action.delaySeconds || 0;
        
        hideJsonError();
        
    } catch (e) {
        showJsonError('Failed to parse JSON: ' + e.message);
    }
}

function showJsonError(message) {
    const alert = document.getElementById('jsonErrorAlert');
    const messageSpan = document.getElementById('jsonErrorMessage');
    messageSpan.textContent = message;
    alert.classList.remove('d-none');
}

function hideJsonError() {
    const alert = document.getElementById('jsonErrorAlert');
    alert.classList.add('d-none');
}

// Playlist Functions
async function startPlaylist() {
    if (playlistActions.length === 0) return;
    
    isPlaylistMode = true;
    currentPlaylistIndex = 0;
    
    // Update UI
    document.getElementById('btnStartPlaylist').classList.add('d-none');
    document.getElementById('btnExitPlaylist').classList.remove('d-none');
    document.getElementById('btnLaunchAction').disabled = true;
    document.getElementById('btnNewAction').disabled = true;
    document.getElementById('btnImportAction').disabled = true;
    
    // Disable all action tiles
    renderActionsGrid();
    
    // Add playlist status indicator
    const grid = document.getElementById('actionsGrid');
    const statusDiv = document.createElement('div');
    statusDiv.id = 'playlistStatus';
    statusDiv.className = 'alert alert-info mb-3';
    statusDiv.innerHTML = '<i class="bi bi-play-circle-fill me-2"></i><strong>Playlist Mode Active</strong><div id="playlistProgress" class="mt-2"></div>';
    grid.insertAdjacentElement('beforebegin', statusDiv);
    
    // Start playing the first action
    await playNextAction();
}

async function playNextAction() {
    if (!isPlaylistMode || currentPlaylistIndex >= playlistActions.length) {
        exitPlaylist();
        return;
    }
    
    const action = playlistActions[currentPlaylistIndex];
    playlistTimeRemaining = action.runTimeInSeconds || 120;
    
    // Update the grid to show active item
    renderActionsGrid();
    
    // Update progress display
    updatePlaylistProgress();
    
    try {
        // Launch the action
        await connection.invoke('SendUrlToClient', clientName, action.targetUrl);
        showConfirmation(`Playing: ${action.name} (${currentPlaylistIndex + 1}/${playlistActions.length})`);
        
        // Start countdown timer
        playlistTimer = setInterval(() => {
            playlistTimeRemaining--;
            updatePlaylistProgress();
            
            if (playlistTimeRemaining <= 0) {
                clearInterval(playlistTimer);
                currentPlaylistIndex++;
                playNextAction();
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error playing action:', error);
        showConfirmation(`Error playing action: ${action.name}`);
        exitPlaylist();
    }
}

function updatePlaylistProgress() {
    const progressDiv = document.getElementById('playlistProgress');
    if (!progressDiv) return;
    
    const action = playlistActions[currentPlaylistIndex];
    const totalTime = action.runTimeInSeconds || 120;
    const percentage = ((totalTime - playlistTimeRemaining) / totalTime) * 100;
    
    const minutes = Math.floor(playlistTimeRemaining / 60);
    const seconds = playlistTimeRemaining % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    progressDiv.innerHTML = `
        <div class="d-flex justify-content-between mb-1">
            <span><strong>${action.name}</strong> (${currentPlaylistIndex + 1}/${playlistActions.length})</span>
            <span>${timeString} remaining</span>
        </div>
        <div class="progress">
            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" 
                 style="width: ${percentage}%" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
    `;
}

function exitPlaylist() {
    // Clear timer
    if (playlistTimer) {
        clearInterval(playlistTimer);
        playlistTimer = null;
    }
    
    // Reset state
    isPlaylistMode = false;
    playlistActions = [];
    currentPlaylistIndex = 0;
    playlistTimeRemaining = 0;
    
    // Update UI
    document.getElementById('btnStartPlaylist').classList.remove('d-none');
    document.getElementById('btnExitPlaylist').classList.add('d-none');
    document.getElementById('btnNewAction').disabled = false;
    document.getElementById('btnImportAction').disabled = false;
    
    // Remove playlist status
    const statusDiv = document.getElementById('playlistStatus');
    if (statusDiv) {
        statusDiv.remove();
    }
    
    // Uncheck all checkboxes and re-enable tiles
    const checkboxes = document.querySelectorAll('.action-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    
    // Re-render grid
    renderActionsGrid();
    
    showConfirmation('Playlist ended');
}

