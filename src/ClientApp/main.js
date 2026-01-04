const { app, BrowserWindow, ipcMain, session, dialog, screen } = require('electron');
const path = require('path');
const signalR = require('@microsoft/signalr');
const os = require('os');
const fs = require('fs');

// Load configuration
let config;
const configPath = path.join(__dirname, 'config.json');
try {
    if (!fs.existsSync(configPath)) {
        console.error('ERROR: config.json not found!');
        console.error(`Expected location: ${configPath}`);
        console.error('Please create config.json based on config.example.json');
        app.quit();
        process.exit(1);
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    
    if (!config.serverUrl || config.serverUrl.trim() === '') {
        console.error('ERROR: serverUrl is not configured in config.json');
        console.error('Please set a valid serverUrl in config.json');
        app.quit();
        process.exit(1);
    }
    
    console.log(`Server URL configured: ${config.serverUrl}`);
} catch (error) {
    console.error('ERROR: Failed to load config.json:', error.message);
    app.quit();
    process.exit(1);
}

let mainWindow = null;
let displayWindow = null;
let connection = null;
let currentClientName = os.hostname();
let serverUrl = '';
let isConnecting = false;
let isDisconnecting = false;

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
    
    // Send config to renderer process when window is ready
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('config-loaded', config);
    });

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

    // Get the specified display or default to primary
    const displays = screen.getAllDisplays();
    const displayIndex = config.displayIndex !== undefined ? config.displayIndex : 0;
    const targetDisplay = displays[displayIndex] || screen.getPrimaryDisplay();
    
    console.log(`Available displays: ${displays.length}`);
    console.log(`Target display ${displayIndex}: ${targetDisplay.bounds.width}x${targetDisplay.bounds.height} at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y})`);
    
    // Log all displays for debugging
    displays.forEach((display, index) => {
        console.log(`  Display ${index}: ${display.bounds.width}x${display.bounds.height} at (${display.bounds.x}, ${display.bounds.y}) ${display.primary ? '(primary)' : ''}`);
    });

    displayWindow = new BrowserWindow({
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height,
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        fullscreen: false,
        show: false, // Don't show until positioned correctly
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'display-preload.js'),
            sandbox: false,
            webSecurity: true
        }
    });

    // Position and show window after it's ready
    displayWindow.once('ready-to-show', () => {
        console.log(`Positioning window on display ${displayIndex}`);
        displayWindow.setBounds(targetDisplay.bounds);
        displayWindow.show();
        
        // Set fullscreen after a short delay to ensure proper positioning
        setTimeout(() => {
            console.log('Setting fullscreen mode');
            displayWindow.setFullScreen(true);
        }, 100);
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

    // Enable HTML5 fullscreen API for embedded content
    displayWindow.webContents.on('enter-html-full-screen', () => {
        displayWindow.setFullScreen(true);
    });

    displayWindow.webContents.on('leave-html-full-screen', () => {
        displayWindow.setFullScreen(true); // Keep window fullscreen even when video exits fullscreen
    });

    displayWindow.loadFile('waiting.html');

    // Add navigation event listeners for debugging
    displayWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        console.log('Will navigate to:', navigationUrl);
    });
    
    displayWindow.webContents.on('did-navigate', (event, navigationUrl) => {
        console.log('Did navigate to:', navigationUrl);
    });
    
    displayWindow.webContents.on('did-navigate-in-page', (event, navigationUrl) => {
        console.log('Did navigate in page to:', navigationUrl);
    });
    
    displayWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', validatedURL, 'Error code:', errorCode, 'Description:', errorDescription);
    });

    // Prevent closing the display window - just toggle fullscreen instead
    displayWindow.on('close', (event) => {
        // Only prevent close if not disconnecting and app isn't quitting
        if (!isDisconnecting && displayWindow && !displayWindow.isDestroyed()) {
            event.preventDefault();
            if (displayWindow.isFullScreen()) {
                displayWindow.setFullScreen(false);
            }
            console.log('Display window close prevented - toggled fullscreen off');
        }
    });

    displayWindow.on('closed', () => {
        console.log('Display window closed event triggered');
        displayWindow = null;
    });

    // Add keyboard shortcut for toggling fullscreen (Escape or F11)
    displayWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'Escape' || input.key === 'F11')) {
            displayWindow.setFullScreen(!displayWindow.isFullScreen());
        }
    });

    // Send display dimensions when ready
    displayWindow.webContents.on('did-finish-load', () => {
        const bounds = displayWindow.getBounds();
        console.log(`Display window dimensions: ${bounds.width}x${bounds.height}`);
        if (connection && currentClientName) {
            connection.invoke('SendDisplayDimensions', currentClientName, bounds.width, bounds.height)
                .catch(err => console.error('Error sending display dimensions:', err));
        }
        
        // Inject action executor script
        injectActionExecutor();
    });

    // Update dimensions on resize
    displayWindow.on('resize', () => {
        const bounds = displayWindow.getBounds();
        console.log(`Display window resized: ${bounds.width}x${bounds.height}`);
        if (connection && currentClientName) {
            connection.invoke('SendDisplayDimensions', currentClientName, bounds.width, bounds.height)
                .catch(err => console.error('Error sending display dimensions:', err));
        }
    });

    return displayWindow;
}

// Inject action executor script into display window
async function injectActionExecutor() {
    if (!displayWindow || displayWindow.isDestroyed()) {
        return;
    }

    try {
        // Read and inject the action executor script
        const actionExecutorPath = path.join(__dirname, 'action-executor.js');
        const actionExecutorScript = fs.readFileSync(actionExecutorPath, 'utf8');
        
        await displayWindow.webContents.executeJavaScript(actionExecutorScript);
        console.log('Action executor injected into display window');
        
        // Request actions from server after injecting the script
        if (connection && currentClientName) {
            await connection.invoke('SendActionsToClient', currentClientName);
        }
    } catch (error) {
        console.error('Error injecting action executor:', error);
    }
}

// Store original console methods before overriding
const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

// Helper function to send logs to server
function sendLog(level, ...args) {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    // Log locally using the original console methods
    originalConsole[level](message);
    
    // Send to server if connected (but don't log about it to avoid infinite loop)
    if (connection && currentClientName) {
        try {
            connection.invoke('SendLogMessage', currentClientName, level, message).catch(() => {
                // Silently fail - don't log errors about logging to avoid recursion
            });
        } catch (error) {
            // Silently fail if we can't send logs
        }
    }
}

// Override console methods to capture logs
console.log = (...args) => sendLog('log', ...args);
console.info = (...args) => sendLog('info', ...args);
console.warn = (...args) => sendLog('warn', ...args);
console.error = (...args) => sendLog('error', ...args);

async function connectToServer(url) {
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

    try {
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

        // Handle mouse click simulation
        connection.on('SimulateMouseClick', (x, y) => {
            console.log(`Simulating mouse click at (${x}, ${y})`);
            if (displayWindow) {
                // Send mouseDown event
                displayWindow.webContents.sendInputEvent({
                    type: 'mouseDown',
                    x: x,
                    y: y,
                    button: 'left',
                    clickCount: 1
                });
                
                // Send mouseUp event to complete the click
                displayWindow.webContents.sendInputEvent({
                    type: 'mouseUp',
                    x: x,
                    y: y,
                    button: 'left',
                    clickCount: 1
                });
                
                console.log('Mouse click simulated successfully');
                mainWindow.webContents.send('click-simulated', { x, y });
            }
        });

        // Handle reset to waiting state
        connection.on('ResetToWaiting', () => {
            console.log('Received reset to waiting command');
            if (displayWindow && !displayWindow.isDestroyed()) {
                displayWindow.loadFile('waiting.html');
                console.log('Display window reset to waiting state');
            }
        });

        // Handle keyboard simulation from action executor
        ipcMain.on('simulate-keypress', (event, key) => {
            console.log(`Simulating key press: ${key}`);
            if (displayWindow && !displayWindow.isDestroyed()) {
                displayWindow.webContents.sendInputEvent({
                    type: 'keyDown',
                    keyCode: key
                });
                displayWindow.webContents.sendInputEvent({
                    type: 'keyUp',
                    keyCode: key
                });
                console.log(`Key '${key}' simulated successfully`);
            }
        });

        // Handle actions received from server
        connection.on('ReceiveActions', (actions) => {
            console.log(`Received ${actions.length} actions from server`);
            console.log('Actions data:', JSON.stringify(actions, null, 2));
            if (displayWindow && !displayWindow.isDestroyed()) {
                displayWindow.webContents.executeJavaScript(`
                    try {
                        if (window.actionExecutor) {
                            window.actionExecutor.loadActions(${JSON.stringify(actions)});
                            window.actionExecutor.enable();
                            console.log('[Main] Actions loaded and enabled successfully');
                        } else {
                            console.error('[Main] actionExecutor not available on window');
                        }
                    } catch (error) {
                        console.error('[Main] Error in loadActions:', error.message, error.stack);
                    }
                `).catch(err => {
                    console.error('Error loading actions:', err.message || err);
                    console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
                });
            }
        });

        // Handle server disconnect - just notify UI, don't disconnect client
        connection.on('ServerDisconnected', async () => {
            console.log('Server page disconnected (user may have navigated away)');
            mainWindow.webContents.send('server-disconnected');
            
            // Reset display window to waiting screen
            if (displayWindow && !displayWindow.isDestroyed()) {
                displayWindow.loadFile('waiting.html');
            }
            
            // Client stays connected to SignalR, waiting for server to reconnect
        });

        // Handle reset signal from admin
        connection.on('ResetClient', async () => {
            console.log('Reset signal received from admin - exiting application');
            isDisconnecting = true; // Allow windows to close
            app.quit();
        });

        connection.onreconnecting(() => {
            mainWindow.webContents.send('reconnecting');
        });

        connection.onreconnected(() => {
            mainWindow.webContents.send('reconnected');
            connection.invoke('ClientJoinSession', currentClientName);
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
        
        const success = await connection.invoke('ClientJoinSession', currentClientName);

        if (success) {
            createDisplayWindow();
            mainWindow.webContents.send('connected', currentClientName);
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
        
        // Determine if this is a server unreachable error
        const isServerUnreachable = 
            error.message.includes('Failed to connect') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ERR_CONNECTION_REFUSED') ||
            error.message.includes('fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('Could not connect');
        
        if (isServerUnreachable) {
            // Show error dialog and exit
            const errorMsg = `Cannot connect to server at ${serverUrl}\n\nPlease ensure:\n1. The server is running\n2. The URL in config.json is correct\n\nThe application will now exit.`;
            
            dialog.showErrorBox('Server Connection Failed', errorMsg);
            console.error('Server unreachable. Exiting application.');
            app.quit();
        } else {
            // For other errors, just notify the UI
            mainWindow.webContents.send('connection-error', error.message);
        }
    } finally {
        isConnecting = false;
    }
}

async function disconnect() {
    isConnecting = false;
    isDisconnecting = true;
    
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
        // Remove all listeners before closing to prevent errors
        displayWindow.removeAllListeners('close');
        displayWindow.close();
        displayWindow = null;
    }
    
    isDisconnecting = false;
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
ipcMain.handle('connect', async (event, { url }) => {
    await connectToServer(url);
});

ipcMain.handle('disconnect', async () => {
    await disconnect();
    app.quit();
});

ipcMain.handle('get-client-name', () => {
    return currentClientName;
});

ipcMain.handle('toggle-fullscreen', () => {
    if (displayWindow && !displayWindow.isDestroyed()) {
        displayWindow.setFullScreen(!displayWindow.isFullScreen());
    } else {
        // If display window doesn't exist, create it
        createDisplayWindow();
    }
});

// Handle action triggered notification from display window
ipcMain.on('action-triggered', (event, actionId) => {
    console.log(`Action triggered: ${actionId}`);
    if (connection && currentClientName) {
        connection.invoke('ActionTriggered', currentClientName, actionId)
            .catch(err => console.error('Error notifying action triggered:', err));
    }
});

// Handle simulate click from action executor
ipcMain.on('simulate-click', (event, x, y) => {
    console.log(`Action requesting mouse click at (${x}, ${y})`);
    if (displayWindow && !displayWindow.isDestroyed()) {
        // Send mouseDown event
        displayWindow.webContents.sendInputEvent({
            type: 'mouseDown',
            x: x,
            y: y,
            button: 'left',
            clickCount: 1
        });
        
        // Send mouseUp event to complete the click
        displayWindow.webContents.sendInputEvent({
            type: 'mouseUp',
            x: x,
            y: y,
            button: 'left',
            clickCount: 1
        });
        
        console.log('Mouse click simulated successfully from action');
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
