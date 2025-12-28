const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    connect: (url, code) => ipcRenderer.invoke('connect', { url, code }),
    disconnect: () => ipcRenderer.invoke('disconnect'),
    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    
    // Event listeners
    onConnected: (callback) => ipcRenderer.on('connected', (event, code) => callback(code)),
    onConnectionError: (callback) => ipcRenderer.on('connection-error', (event, error) => callback(error)),
    onUrlReceived: (callback) => ipcRenderer.on('url-received', (event, url) => callback(url)),
    onScriptExecuted: (callback) => ipcRenderer.on('script-executed', (event, result) => callback(result)),
    onServerDisconnected: (callback) => ipcRenderer.on('server-disconnected', () => callback()),
    onReconnecting: (callback) => ipcRenderer.on('reconnecting', () => callback()),
    onReconnected: (callback) => ipcRenderer.on('reconnected', () => callback()),
    onConnectionClosed: (callback) => ipcRenderer.on('connection-closed', () => callback())
});
