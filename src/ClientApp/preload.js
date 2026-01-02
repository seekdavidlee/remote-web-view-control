const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    connect: (url) => ipcRenderer.invoke('connect', { url }),
    disconnect: () => ipcRenderer.invoke('disconnect'),
    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    getClientName: () => ipcRenderer.invoke('get-client-name'),
    
    // Event listeners
    onConfigLoaded: (callback) => ipcRenderer.on('config-loaded', (event, config) => callback(config)),
    onConnected: (callback) => ipcRenderer.on('connected', (event, clientName) => callback(clientName)),
    onConnectionError: (callback) => ipcRenderer.on('connection-error', (event, error) => callback(error)),
    onUrlReceived: (callback) => ipcRenderer.on('url-received', (event, url) => callback(url)),
    onScriptExecuted: (callback) => ipcRenderer.on('script-executed', (event, result) => callback(result)),
    onServerDisconnected: (callback) => ipcRenderer.on('server-disconnected', () => callback()),
    onReconnecting: (callback) => ipcRenderer.on('reconnecting', () => callback()),
    onReconnected: (callback) => ipcRenderer.on('reconnected', () => callback()),
    onConnectionClosed: (callback) => ipcRenderer.on('connection-closed', () => callback()),
    onResetToInitial: (callback) => ipcRenderer.on('reset-to-initial', () => callback())
});
