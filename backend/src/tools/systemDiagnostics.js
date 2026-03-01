// backend/src/tools/systemDiagnostics.js
// Specialized tools for Agent self-diagnosis and hotfix proposals

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '../../');
const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || path.join(__dirname, '../../workspace');
const HOTFIX_DIR = path.join(WORKSPACE_ROOT, 'hotfixes');

// Ensure hotfix directory exists
if (!fs.existsSync(HOTFIX_DIR)) {
    fs.mkdirSync(HOTFIX_DIR, { recursive: true });
}

/**
 * Safely read source code files (Limited to current project)
 */
function readSourceCode(relativePath) {
    try {
        const fullPath = path.resolve(PROJECT_ROOT, relativePath);

        // Safety: Only allow reading within PROJECT_ROOT and NOT sensitive files
        if (!fullPath.startsWith(PROJECT_ROOT)) {
            return `Access denied: "${relativePath}" is outside the development area.`;
        }

        const sensitiveFiles = ['.env', 'package-lock.json', '.git'];
        if (sensitiveFiles.some(f => fullPath.includes(f))) {
            return `Access denied: "${relativePath}" contains sensitive information.`;
        }

        if (!fs.existsSync(fullPath)) {
            return `File not found: "${relativePath}"`;
        }

        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            return `"${relativePath}" is a directory. Please provide a file path.`;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        return `📜 Source: ${relativePath}\n---\n${content}`;
    } catch (error) {
        return `Error reading source code: ${error.message}`;
    }
}

/**
 * Propose a code fix/patch to be reviewed by the User
 */
function proposeHotfix(fileName, codeReason, proposedCode) {
    try {
        const safeFileName = fileName.replace(/[^\w\s\-\.]/g, '').trim();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hotfixPath = path.join(HOTFIX_DIR, `fix_${timestamp}_${safeFileName}`);

        const logContent = `HOTFIX PROPOSAL\nReason: ${codeReason}\n\nProposed Code:\n\n${proposedCode}`;
        fs.writeFileSync(hotfixPath, logContent, 'utf-8');

        return `✅ Hotfix proposal saved for review!\nPath: workspace/hotfixes/${path.basename(hotfixPath)}\n\nPlease review this code. You can apply it manually or tell me to try another approach.`;
    } catch (error) {
        return `Error proposing hotfix: ${error.message}`;
    }
}

/**
 * Apply a code fix/patch to the source code.
 * THIS IS A HIGH-RISK OPERATION AND SHOULD BE CALLED VIA HITL.
 */
function applyHotfix(targetFilePath, approvedCode) {
    try {
        const fullPath = path.resolve(PROJECT_ROOT, targetFilePath);

        // Safety: Only allow writing within PROJECT_ROOT/src
        if (!fullPath.startsWith(path.join(PROJECT_ROOT, 'src'))) {
            return `Access denied: "${targetFilePath}" is not in the source code (src/) directory. You can only hotfix the backend logic.`;
        }

        if (!fs.existsSync(fullPath)) {
            return `File not found: "${targetFilePath}"`;
        }

        // Backup original file first
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(WORKSPACE_ROOT, 'backups', `backup_${timestamp}_${path.basename(targetFilePath)}`);

        if (!fs.existsSync(path.join(WORKSPACE_ROOT, 'backups'))) {
            fs.mkdirSync(path.join(WORKSPACE_ROOT, 'backups'), { recursive: true });
        }

        fs.copyFileSync(fullPath, backupPath);

        // Overwrite with new code
        fs.writeFileSync(fullPath, approvedCode, 'utf-8');

        return `✅ Hotfix applied successfully to "${targetFilePath}"!\n\nA backup of the original file was saved to: workspace/backups/${path.basename(backupPath)}`;
    } catch (error) {
        return `Error applying hotfix: ${error.message}`;
    }
}

// Declarations
const readSourceCodeDeclaration = {
    name: 'read_source_code',
    description: 'ใช้สำหรับ "วิเคราะห์ตัวเอง" โดยการอ่านโค้ดของระบบ G-A-COWORK (เช่น src/server.js, src/tools/fileManager.js) เพื่อค้นหาบั๊กหรือปรับปรุง Logic เมื่อเกิดข้อผิดพลาด',
    parameters: {
        type: 'OBJECT',
        properties: {
            relativePath: {
                type: 'STRING',
                description: 'Relative path starting from project root (e.g., "src/server.js", "src/tools/codeRunner.js")'
            }
        },
        required: ['relativePath']
    }
};

const proposeHotfixDeclaration = {
    name: 'propose_hotfix',
    description: 'ใช้สำหรับเสนอวิธีแก้ปัญหา (Patch) เมื่อพบว่าโค้ดระบบมีบั๊ก โดย Agent จะบันทึกไฟล์แก้ไขที่แนะนำไว้ให้ User ตรวจสอบในโฟลเดอร์ hotfixes',
    parameters: {
        type: 'OBJECT',
        properties: {
            fileName: {
                type: 'STRING',
                description: 'Name of the fix file (e.g., "server_fix.js", "tool_fix.js")'
            },
            codeReason: {
                type: 'STRING',
                description: 'เหตุผลที่ต้องแก้ไขหรือวิเคราะห์ปัญหาที่พบ'
            },
            proposedCode: {
                type: 'STRING',
                description: 'โค้ดที่เสนอให้แก้ไข (Full snippet or file)'
            }
        },
        required: ['fileName', 'codeReason', 'proposedCode']
    }
};

const applyHotfixDeclaration = {
    name: 'apply_hotfix',
    description: 'ใช้สำหรับ "ลงซ่อมจริง" (Apply) หลังจาก User อนุมัติโค้ดที่เสนอ โดย Agent จะทำการเขียนทับไฟล์ต้นฉบับด้วยโค้ดใหม่ เครื่องมือนี้เป็นเครื่องมืออันตรายและจะมีการส่งปุ่มยืนยันไปที่ User เสมอก่อนทำงาน',
    parameters: {
        type: 'OBJECT',
        properties: {
            targetFilePath: {
                type: 'STRING',
                description: 'Path of the file to be updated (e.g., "src/tools/activityLogger.js")'
            },
            approvedCode: {
                type: 'STRING',
                description: 'The final code to be written to the file'
            }
        },
        required: ['targetFilePath', 'approvedCode']
    }
};

module.exports = {
    readSourceCode,
    proposeHotfix,
    applyHotfix,
    readSourceCodeDeclaration,
    proposeHotfixDeclaration,
    applyHotfixDeclaration
};
