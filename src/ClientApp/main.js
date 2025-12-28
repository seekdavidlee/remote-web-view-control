const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const signalR = require('@microsoft/signalr');

let mainWindow = null;
let displayWindow = null;
let connection = null;
let currentSessionCode = null;
let serverUrl = '';

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (displayWindow) {
            displayWindow.close();
        }
        app.quit();
    });
}

function createDisplayWindow() {
    if (displayWindow) {
        return displayWindow;
    }

    displayWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'display-preload.js'),
            sandbox: false,
            webSecurity: true
        }
    });

    // Handle permission requests (fullscreen, media, etc.)
    displayWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        // Allow all permissions for the display window
        callback(true);
    });

    // Also handle permission checks - allow all
    displayWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
        return true;
    });

    // Enable HTML5 fullscreen API for embedded content (like YouTube videos)
    displayWindow.webContents.on('enter-html-full-screen', () => {
        displayWindow.setFullScreen(true);
    });

    displayWindow.webContents.on('leave-html-full-screen', () => {
        displayWindow.setFullScreen(true); // Keep window fullscreen even when video exits fullscreen
    });

    displayWindow.loadFile('waiting.html');

    displayWindow.on('closed', () => {
        displayWindow = null;
    });

    return displayWindow;
}

async function connectToServer(url, code) {
    serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
    currentSessionCode = code.toUpperCase();

    try {
        // Validate code first
        const response = await fetch(`${serverUrl}/api/session/validate/${currentSessionCode}`);
        const data = await response.json();
        
        if (!data.valid) {
            mainWindow.webContents.send('connection-error', 'Invalid code');
            return;
        }

        // Create SignalR connection
        connection = new signalR.HubConnectionBuilder()
            .withUrl(`${serverUrl}/hub/remoteview`)
            .withAutomaticReconnect()
            .build();

        // Handle URL commands
        connection.on('ReceiveUrl', (url) => {
            console.log('Received URL:', url);
            if (!displayWindow) {
                createDisplayWindow();
            }
            displayWindow.loadURL(url);
            displayWindow.focus();
            mainWindow.webContents.send('url-received', url);
        });

        // Handle custom JavaScript execution
        connection.on('ExecuteScript', (script) => {
            console.log('Executing script:', script);
            if (displayWindow) {
                // For fullscreen, use keyboard simulation instead of JS execution
                if (script.includes('fullscreen') || script.includes('requestFullscreen')) {
                    // Simulate pressing 'f' key for YouTube fullscreen toggle
                    displayWindow.webContents.sendInputEvent({
                        type: 'keyDown',
                        keyCode: 'f'
                    });
                    displayWindow.webContents.sendInputEvent({
                        type: 'keyUp',
                        keyCode: 'f'
                    });
                    mainWindow.webContents.send('script-executed', { success: true, result: 'Fullscreen toggled via keyboard' });
                } else {
                    displayWindow.webContents.executeJavaScript(script)
                        .then(result => {
                            console.log('Script result:', result);
                            mainWindow.webContents.send('script-executed', { success: true, result });
                        })
                        .catch(error => {
                            console.error('Script error:', error);
                            mainWindow.webContents.send('script-executed', { success: false, error: error.message });
                        });
                }
            }
        });

        // Handle server disconnect
        connection.on('ServerDisconnected', () => {
            mainWindow.webContents.send('server-disconnected');
        });

        connection.onreconnecting(() => {
            mainWindow.webContents.send('reconnecting');
        });

        connection.onreconnected(() => {
            mainWindow.webContents.send('reconnected');
            connection.invoke('ClientJoinSession', currentSessionCode);
        });

        connection.onclose(() => {
            mainWindow.webContents.send('connection-closed');
        });

        // Start connection
        await connection.start();
        const success = await connection.invoke('ClientJoinSession', currentSessionCode);

        if (success) {
            createDisplayWindow();
            mainWindow.webContents.send('connected', currentSessionCode);
        } else {
            mainWindow.webContents.send('connection-error', 'Failed to join session');
        }
    } catch (error) {
        console.error('Connection error:', error);
        mainWindow.webContents.send('connection-error', error.message);
    }
}

function disconnect() {
    if (connection) {
        connection.stop();
        connection = null;
    }
    if (displayWindow) {
        displayWindow.close();
        displayWindow = null;
    }
    currentSessionCode = null;
}

// IPC handlers
ipcMain.handle('connect', async (event, { url, code }) => {
    await connectToServer(url, code);
});

ipcMain.handle('disconnect', () => {
    disconnect();
});

ipcMain.handle('toggle-fullscreen', () => {
    if (displayWindow) {
        displayWindow.setFullScreen(!displayWindow.isFullScreen());
    }
});

// App lifecycle
app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});
