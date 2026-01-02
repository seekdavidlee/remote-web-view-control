let connection = null;
let clearAllModal = null;

async function loadSessions() {
    try {
        const response = await fetch('/api/admin/sessions');
        const sessions = await response.json();
        
        displaySessions(sessions);
        updateLastRefresh();
    } catch (error) {
        console.error('Error loading sessions:', error);
        showError('Failed to load sessions');
    }
}

function displaySessions(sessions) {
    const container = document.getElementById('sessionsContainer');
    const countBadge = document.getElementById('sessionCount');
    
    countBadge.textContent = `${sessions.length} Session${sessions.length !== 1 ? 's' : ''}`;

    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox display-1 text-muted"></i>
                <p class="mt-3 mb-0">No active sessions</p>
                <small class="text-muted">Sessions will appear here when created</small>
            </div>
        `;
        return;
    }

    const tableHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Client Name</th>
                        <th>Connected</th>
                        <th>Server Status</th>
                        <th>Client Status</th>
                        <th>Overall Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.map(session => createSessionRow(session)).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHTML;
}

function createSessionRow(session) {
    const serverStatus = session.isServerConnected;
    const clientStatus = session.isClientConnected;
    
    let overallStatus, overallClass;
    if (serverStatus && clientStatus) {
        overallStatus = 'Fully Connected';
        overallClass = 'status-connected';
    } else if (serverStatus || clientStatus) {
        overallStatus = 'Partially Connected';
        overallClass = 'status-partial';
    } else {
        overallStatus = 'Disconnected';
        overallClass = 'status-disconnected';
    }

    const connectedTime = new Date(session.lastActivity).toLocaleString();
    const timeAgo = getTimeAgo(new Date(session.lastActivity));

    return `
        <tr>
            <td>
                <a href="/server/${encodeURIComponent(session.clientName)}" class="session-code">
                    ${escapeHtml(session.clientName)}
                </a>
            </td>
            <td>
                <div>${connectedTime}</div>
                <small class="text-muted">${timeAgo}</small>
            </td>
            <td>
                <i class="bi bi-circle-fill ${serverStatus ? 'text-success' : 'text-danger'}"></i>
                ${serverStatus ? 'Connected' : 'Disconnected'}
            </td>
            <td>
                <i class="bi bi-circle-fill ${clientStatus ? 'text-success' : 'text-danger'}"></i>
                ${clientStatus ? 'Connected' : 'Disconnected'}
            </td>
            <td>
                <span class="status-badge ${overallClass}">
                    ${overallStatus}
                </span>
            </td>
        </tr>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function updateLastRefresh() {
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

function showError(message) {
    const container = document.getElementById('sessionsContainer');
    container.innerHTML = `
        <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle me-2"></i>${message}
        </div>
    `;
}

async function clearAllSessions() {
    try {
        // Use SignalR to clear sessions so signals are sent to clients
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            console.log('Clearing all sessions via SignalR...');
            await connection.invoke('ClearAllSessions');
            console.log('Sessions cleared successfully');
            
            // Wait a moment for clients to disconnect
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Reload sessions
            await loadSessions();
            
            // Show success message
            const container = document.getElementById('sessionsContainer');
            const successAlert = document.createElement('div');
            successAlert.className = 'alert alert-success alert-dismissible fade show';
            successAlert.innerHTML = `
                <i class="bi bi-check-circle me-2"></i>All sessions cleared successfully!
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            container.insertBefore(successAlert, container.firstChild);
            
            setTimeout(() => successAlert.remove(), 5000);
        } else {
            throw new Error('Not connected to server');
        }
    } catch (error) {
        console.error('Error clearing sessions:', error);
        alert('Failed to clear sessions: ' + error.message);
    }
}

async function connectToHub() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl('/hub/remoteview')
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Information)
        .build();

    try {
        await connection.start();
        console.log('SignalR connected');
    } catch (error) {
        console.error('SignalR connection error:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    clearAllModal = new bootstrap.Modal(document.getElementById('clearAllModal'));
    
    // Setup event listeners
    document.getElementById('btnRefresh').addEventListener('click', async () => {
        const icon = document.querySelector('.refresh-btn');
        icon.classList.add('spinning');
        await loadSessions();
        setTimeout(() => icon.classList.remove('spinning'), 1000);
    });

    document.getElementById('btnClearAll').addEventListener('click', () => {
        clearAllModal.show();
    });

    document.getElementById('btnConfirmClear').addEventListener('click', async () => {
        clearAllModal.hide();
        await clearAllSessions();
    });
    
    // Check for error messages in URL
    const urlParams = new URLSearchParams(window.location.search);
    const errorMsg = urlParams.get('error');
    if (errorMsg) {
        const container = document.getElementById('sessionsContainer');
        const errorAlert = document.createElement('div');
        errorAlert.className = 'alert alert-danger alert-dismissible fade show';
        errorAlert.innerHTML = `
            <i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(errorMsg)}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        container.insertBefore(errorAlert, container.firstChild);
        
        // Clear error from URL after showing it
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    await connectToHub();
    await loadSessions();
    
    // Auto-refresh every 5 seconds
    setInterval(loadSessions, 5000);
});
