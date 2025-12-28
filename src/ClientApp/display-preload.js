const { contextBridge } = require('electron');

// Minimal preload for display window - no special APIs needed
contextBridge.exposeInMainWorld('displayAPI', {
    isDisplayWindow: true
});
