HOTFIX PROPOSAL
Reason: The current activityLogger.js uses synchronous file I/O operations (fs.appendFileSync, fs.readFileSync) which can block the Node.js event loop, leading to performance issues and higher latency, especially under heavy load. Additionally, readActivityLogs reads the entire log file into memory before slicing, which becomes inefficient as the log file grows. This hotfix proposes to:
1.  Convert to Asynchronous I/O: Use fs.promises.appendFile and fs.promises.readFile for non-blocking operations.
2.  Improve error handling: Add proper error handling for promises.
3.  Future consideration: Suggest implementing a log rotation/truncation mechanism for very large log files.

Proposed Code:

// backend/src/tools/activityLogger.js (Hotfix version)
const fs = require('fs').promises; // Use fs.promises for async operations
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || path.join(__dirname, '../../workspace');
const LOG_PATH = path.join(WORKSPACE_ROOT, 'activity.log');

// Ensure log directory exists
async function ensureLogDirectory() {
    try {
        await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    } catch (err) {
        console.error('Failed to ensure log directory:', err);
    }
}

/**
 * Add an entry to the activity log
 * @param {string} action - The action performed (e.g., 'organize_file')
 * @param {object} details - Arguments or details of the action
 * @param {string} status - 'Pending', 'Approved', 'Rejected', 'Completed', 'Auto-Approved'
 * @param {string} authBy - 'System' or 'Human'
 * @returns {Promise<object>} A promise that resolves to the log entry created
 */
async function addActivityLog(action, details, status, authBy = 'System') {
    await ensureLogDirectory(); // Ensure directory exists before writing

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
 * Read the last N activity logs
 * @param {number} limit - Number of logs to return
 * @returns {Promise<Array>} A promise that resolves to a list of log entries
 */
async function readActivityLogs(limit = 10) {
    try {
        await ensureLogDirectory(); // Ensure directory exists before reading
        
        const fileExists = await fs.access(LOG_PATH).then(() => true).catch(() => false);
        if (!fileExists) {
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
    readActivityLogs
};
