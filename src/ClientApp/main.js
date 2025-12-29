const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const signalR = require('@microsoft/signalr');

let mainWindow = null;
let displayWindow = null;
let connection = null;
let currentSessionCode = null;
let serverUrl = '';
let isConnecting = false;

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
        console.log('Display window closed event triggered');
        displayWindow = null;
    });

    return displayWindow;
}

async function connectToServer(url, code) {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        console.log('Connection already in progress');
        return;
    }

    // Disconnect any existing connection first
    if (connection) {
        await disconnect();
    }

    isConnecting = true;
    serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
    currentSessionCode = code.toUpperCase();

    try {
        // Validate code first
        const response = await fetch(`${serverUrl}/api/session/validate/${currentSessionCode}`);
        const data = await response.json();
        
        if (!data.valid) {
            mainWindow.webContents.send('connection-error', 'Invalid code');
            isConnecting = false;
            return;
        }

        // Create SignalR connection with longer timeouts for Raspberry Pi
        connection = new signalR.HubConnectionBuilder()
            .withUrl(`${serverUrl}/hub/remoteview`, {
                timeout: 60000, // 60 seconds timeout (increased for slower devices)
                headers: {
                    'User-Agent': 'ElectronClient/1.0'
                },
                // Use transport fallbacks for better compatibility on Raspberry Pi
                transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling,
                skipNegotiation: false, // Ensure proper transport negotiation
                withCredentials: false // Don't send credentials (helps with CORS)
            })
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds: retryContext => {
                    // Progressive backoff: 2s, 5s, 10s, 30s
                    if (retryContext.previousRetryCount === 0) return 2000;
                    if (retryContext.previousRetryCount === 1) return 5000;
                    if (retryContext.previousRetryCount === 2) return 10000;
                    return 30000;
                }
            })
            .configureLogging(signalR.LogLevel.Information)
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

        // Handle server disconnect - fully disconnect client
        connection.on('ServerDisconnected', async () => {
            console.log('Server disconnected - resetting client');
            mainWindow.webContents.send('server-disconnected');
            await resetToInitialState();
        });

        // Handle reset signal from admin
        connection.on('ResetClient', async () => {
            console.log('Reset signal received from admin');
            await resetToInitialState();
        });

        connection.onreconnecting(() => {
            mainWindow.webContents.send('reconnecting');
        });

        connection.onreconnected(() => {
            mainWindow.webContents.send('reconnected');
            connection.invoke('ClientJoinSession', currentSessionCode);
        });

        connection.onclose(async (error) => {
            console.log('Connection closed', error);
            isConnecting = false;
            
            // Clean up display window if connection closes unexpectedly
            if (displayWindow && !displayWindow.isDestroyed()) {
                displayWindow.close();
                displayWindow = null;
            }
            
            mainWindow.webContents.send('connection-closed');
        });

        // Start connection with error handling
        console.log('Starting SignalR connection...');
        await connection.start();
        console.log('SignalR connection started successfully');
        
        const success = await connection.invoke('ClientJoinSession', currentSessionCode);

        if (success) {
            createDisplayWindow();
            mainWindow.webContents.send('connected', currentSessionCode);
        } else {
            await disconnect();
            mainWindow.webContents.send('connection-error', 'Failed to join session');
        }
    } catch (error) {
        console.error('Connection error:', error);
        
        // Clean up connection on error
        if (connection) {
            try {
                await connection.stop();
            } catch (stopError) {
                console.error('Error stopping connection:', stopError);
            }
            connection = null;
        }
        
        mainWindow.webContents.send('connection-error', error.message);
    } finally {
        isConnecting = false;
    }
}

async function disconnect() {
    isConnecting = false;
    
    if (connection) {
        try {
            // Check if connection is in a state where it can be stopped
            if (connection.state !== signalR.HubConnectionState.Disconnected) {
                console.log('Stopping connection...');
                await connection.stop();
                console.log('Connection stopped');
            }
        } catch (error) {
            console.error('Error during disconnect:', error);
        } finally {
            connection = null;
        }
    }
    
    if (displayWindow && !displayWindow.isDestroyed()) {
        console.log('Closing display window');
        displayWindow.close();
        displayWindow = null;
    }
    
    currentSessionCode = null;
}

async function resetToInitialState() {
    console.log('Resetting to initial state...');
    
    // Force close display window immediately
    if (displayWindow && !displayWindow.isDestroyed()) {
        console.log('Forcing display window to close');
        displayWindow.close();
        displayWindow = null;
    }
    
    // Disconnect from server
    await disconnect();
    
    // Notify the main window to reset UI
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reset-to-initial');
    }
}

// IPC handlers
ipcMain.handle('connect', async (event, { url, code }) => {
    await connectToServer(url, code);
});

ipcMain.handle('disconnect', async () => {
    await disconnect();
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
