// backend/src/tools/activityLogger.js
const fs = require('fs').promises;
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || path.join(__dirname, '../../workspace');
const LOG_PATH = path.join(WORKSPACE_ROOT, 'activity.log');

// Ensure log directory exists
async function ensureLogDirectory() {
    try {
        await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    } catch (err) {
        // Silently fail if exists
    }
}

/**
 * Add an entry to the activity log
 */
async function addActivityLog(action, details, status, authBy = 'System') {
    await ensureLogDirectory();

    const entry = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toLocaleString('th-TH'),
        isoTimestamp: new Date().toISOString(),
        action,
        details: typeof details === 'object' ? JSON.stringify(details) : details,
        status,
        authorizedBy: authBy
    };

    try {
        await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (err) {
        console.error('Failed to write activity log:', err);
    }

    return entry;
}

/**
 * Update the status of an existing log entry
 */
async function updateActivityStatus(id, newStatus) {
    try {
        const data = await fs.readFile(LOG_PATH, 'utf8');
        const lines = data.trim().split('\n');
        const updatedLines = lines.map(line => {
            const entry = JSON.parse(line);
            if (entry.id === id) {
                entry.status = newStatus;
                entry.timestamp = new Date().toLocaleString('th-TH'); // Update timestamp to show when it changed
                return JSON.stringify(entry);
            }
            return line;
        });

        await fs.writeFile(LOG_PATH, updatedLines.join('\n') + '\n');
    } catch (err) {
        console.error('Failed to update activity log:', err);
    }
}

/**
 * Read the last N activity logs
 */
async function readActivityLogs(limit = 10) {
    try {
        await ensureLogDirectory();

        try {
            await fs.access(LOG_PATH);
        } catch {
            return [];
        }

        const data = await fs.readFile(LOG_PATH, 'utf8');
        const lines = data.trim().split('\n').filter(l => l.trim());

        return lines.slice(-limit).map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return { error: 'Invalid log entry', raw: line };
            }
        });
    } catch (error) {
        console.error('Error reading activity log:', error);
        return [];
    }
}

module.exports = {
    addActivityLog,
    updateActivityStatus,
    readActivityLogs
};
