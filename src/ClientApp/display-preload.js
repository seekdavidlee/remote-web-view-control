const { contextBridge, ipcRenderer } = require('electron');

// Minimal preload for display window - no special APIs needed
contextBridge.exposeInMainWorld('displayAPI', {
    isDisplayWindow: true
});

// Expose action executor API for notifying when actions are triggered
contextBridge.exposeInMainWorld('actionExecutorAPI', {
    notifyActionTriggered: (actionId) => ipcRenderer.send('action-triggered', actionId),
    simulateClick: (x, y) => ipcRenderer.send('simulate-click', x, y),
    simulateKeyPress: (key) => ipcRenderer.send('simulate-keypress', key)
});
