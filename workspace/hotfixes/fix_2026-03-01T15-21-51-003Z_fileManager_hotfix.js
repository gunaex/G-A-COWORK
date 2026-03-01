HOTFIX PROPOSAL
Reason: 
1.  **ประสิทธิภาพในการย้ายไฟล์ (`organizeFile`):** เปลี่ยนจากการคัดลอกไฟล์แล้วลบไฟล์ต้นฉบับ (`fs.copyFileSync` + `fs.unlinkSync`) ไปเป็นการเปลี่ยนชื่อไฟล์ (`fs.renameSync`) ซึ่งมีประสิทธิภาพมากกว่าและเป็น Atomic Operation (ดำเนินการทั้งหมดหรือไม่มีเลย) สำหรับการย้ายไฟล์ภายในระบบไฟล์เดียวกัน ช่วยลด I/O และโอกาสเกิด Race Condition.
2.  **การอ่านเอกสารและการตัดทอนข้อความ (`readDocument`):**
    *   กำหนดค่า `MAX_READ_SIZE` เป็นค่าคงที่ เพื่อให้ง่ายต่อการบำรุงรักษาและปรับเปลี่ยนขนาดการอ่านสูงสุดในอนาคต.
    *   ปรับปรุงข้อความแจ้งเตือนการตัดทอนข้อความ (`... [truncated]`) ให้แสดงจำนวนอักขระทั้งหมดของไฟล์ที่ถูกตัดทอน เช่น `... [truncated: 5000 of 12345 characters]` เพื่อให้ข้อมูลที่เป็นประโยชน์มากขึ้นแก่ผู้ใช้.


Proposed Code:


// backend/src/tools/fileManager.js
// File management tool for the /workspace directory

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse'); // Moved to top for consistency
const mammoth = require('mammoth');   // Moved to top for consistency

// Workspace root (Docker volume mount point)
const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || path.join(__dirname, '../../workspace');
const INBOUND_DIR = path.join(WORKSPACE_ROOT, 'inbound');
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, 'projects');

// Max content size to read and display to prevent overwhelming the AI or memory
const MAX_READ_SIZE = 5000; // characters

// Ensure directories exist
[WORKSPACE_ROOT, INBOUND_DIR, PROJECTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * Safely resolve a path within the workspace (prevent path traversal)
 */
function safeResolve(relativePath) {
    const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
        throw new Error(`Access denied: path "${relativePath}" is outside the workspace`);
    }
    return resolved;
}

/**
 * List files in a directory within the workspace
 */
function listFiles(dir = 'inbound') {
    try {
        const fullPath = safeResolve(dir);
        if (!fs.existsSync(fullPath)) {
            return `Directory "${dir}" does not exist in workspace.`;
        }

        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        if (entries.length === 0) {
            return `📂 Directory "${dir}" is empty.\n\nWorkspace path: ${fullPath}`;
        }

        const files = [];
        const dirs = [];

        entries.forEach(entry => {
            if (entry.isDirectory()) {
                dirs.push(`📁 ${entry.name}/`);
            } else {
                const filePath = path.join(fullPath, entry.name);
                const stats = fs.statSync(filePath);
                const sizeKb = (stats.size / 1024).toFixed(1);
                const ext = path.extname(entry.name).toLowerCase();
                const icon = ext === '.pdf' ? '📄' : ext === '.docx' ? '📝' : ext === '.txt' ? '📃' : '📋';
                files.push(`${icon} ${entry.name} (${sizeKb} KB)`);
            }
        });

        let result = `📂 Contents of workspace/${dir}:\n\n`;
        if (dirs.length > 0) result += dirs.join('\n') + '\n';
        if (files.length > 0) result += files.join('\n');
        result += `\n\nTotal: ${dirs.length} folders, ${files.length} files`;

        return result;
    } catch (error) {
        return `Error listing files: ${error.message}`;
    }
}

/**
 * Read a document (TXT, PDF, DOCX) from the workspace
 */
async function readDocument(filePath) {
    try {
        const fullPath = safeResolve(filePath);
        if (!fs.existsSync(fullPath)) {
            return `File not found: "${filePath}"`;
        }

        const ext = path.extname(fullPath).toLowerCase();
        const stats = fs.statSync(fullPath);

        if (stats.size > 10 * 1024 * 1024) {
            return `File too large to read (${(stats.size / 1024 / 1024).toFixed(1)} MB). Max size: 10 MB`;
        }

        if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const truncatedContent = content.slice(0, MAX_READ_SIZE);
            const truncationMessage = content.length > MAX_READ_SIZE ? `\n... [truncated: ${MAX_READ_SIZE} of ${content.length} characters]` : '';
            return `📃 File: ${filePath}\nSize: ${(stats.size / 1024).toFixed(1)} KB\n\nContent:\n---\n${truncatedContent}${truncationMessage}`;
        }

        if (ext === '.pdf') {
            try {
                const buffer = fs.readFileSync(fullPath);
                const data = await pdfParse(buffer);
                const text = data.text;
                const truncatedText = text.slice(0, MAX_READ_SIZE);
                const truncationMessage = text.length > MAX_READ_SIZE ? `\n... [truncated: ${MAX_READ_SIZE} of ${text.length} characters]` : '';
                return `📄 PDF: ${filePath}\nPages: ${data.numpages} | Size: ${(stats.size / 1024).toFixed(1)} KB\n\nExtracted Text:\n---\n${truncatedText}${truncationMessage}`;
            } catch (e) {
                return `Error reading PDF: ${e.message}`;
            }
        }

        if (ext === '.docx') {
            try {
                const result = await mammoth.extractRawText({ path: fullPath });
                const text = result.value;
                const truncatedText = text.slice(0, MAX_READ_SIZE);
                const truncationMessage = text.length > MAX_READ_SIZE ? `\n... [truncated: ${MAX_READ_SIZE} of ${text.length} characters]` : '';
                return `📝 DOCX: ${filePath}\nSize: ${(stats.size / 1024).toFixed(1)} KB\n\nExtracted Text:\n---\n${truncatedText}${truncationMessage}`;
            } catch (e) {
                return `Error reading DOCX: ${e.message}`;
            }
        }

        return `Unsupported file type: "${ext}". Supported: .txt, .md, .csv, .json, .pdf, .docx`;
    } catch (error) {
        return `Error reading document: ${error.message}`;
    }
}

/**
 * Write a text file to the workspace
 */
function writeFile(filePath, content) {
    try {
        const fullPath = safeResolve(filePath);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        const stats = fs.statSync(fullPath);
        return `✅ File written successfully!\nPath: workspace/${filePath}\nSize: ${(stats.size / 1024).toFixed(1)} KB`;
    } catch (error) {
        return `Error writing file: ${error.message}`;
    }
}

/**
 * Organize a file: move it to projects/{projectName}/{docType}/ with a new name
 */
function organizeFile(oldPath, projectName, docType, newFileName) {
    try {
        const sourcePath = safeResolve(oldPath);
        if (!fs.existsSync(sourcePath)) {
            return `Source file not found: "${oldPath}"`;
        }

        // Sanitize project name and doc type
        const safeProjName = projectName.replace(/[^\w\s\-\.]/g, '').trim();
        const safeDocType = docType.replace(/[^\w\s\-]/g, '').trim();
        const ext = path.extname(newFileName) || path.extname(oldPath);
        const baseName = path.basename(newFileName, path.extname(newFileName));
        const finalName = `[${safeProjName}] ${baseName}${ext}`;

        // Create destination directory
        const destDir = path.join(PROJECTS_DIR, safeProjName, safeDocType);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const destPath = path.join(destDir, finalName);

        // Move the file using rename for efficiency
        fs.renameSync(sourcePath, destPath);

        return `✅ File organized successfully!\n\nFrom: workspace/${oldPath}\nTo: workspace/projects/${safeProjName}/${safeDocType}/${finalName}\n\nProject: ${safeProjName}\nType: ${safeDocType}\nNew Name: ${finalName}`;
    } catch (error) {
        return `Error organizing file: ${error.message}`;
    }
}

/**
 * Read the latest activity log for AI to self-reflect or inform the user
 */
async function readActivityLogTool(limit = 10) {
    try {
        const { readActivityLogs } = require('./activityLogger');
        const logs = readActivityLogs(limit);

        if (logs.length === 0) {
            return "No activity logs found yet. The system is fresh.";
        }

        return JSON.stringify({
            status: "success",
            message: `Retrieved last ${logs.length} activities`,
            data: logs
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.message });
    }
}

// Tool declarations for Gemini function calling
const listFilesDeclaration = {
    name: 'list_files',
    description: 'List all files and folders in a workspace directory. Use this to see what files are available before reading or organizing them.',
    parameters: {
        type: 'OBJECT',
        properties: {
            directory: {
                type: 'STRING',
                description: 'Relative path within the workspace (e.g., "inbound", "projects/Alpha", ""). Default is "inbound".'
            }
        },
        required: []
    }
};

const readDocumentDeclaration = {
    name: 'read_document',
    description: 'Read and extract text content from a file in the workspace. Supports TXT, MD, CSV, JSON, PDF, and DOCX formats. Use this to understand file contents before deciding how to organize them.',
    parameters: {
        type: 'OBJECT',
        properties: {
            path: {
                type: 'STRING',
                description: 'Relative file path within the workspace (e.g., "inbound/document.pdf")'
            }
        },
        required: ['path']
    }
};

const writeFileDeclaration = {
    name: 'write_file',
    description: 'Write text content to a file in the workspace. Use this to save reports, summaries, or any text output.',
    parameters: {
        type: 'OBJECT',
        properties: {
            path: {
                type: 'STRING',
                description: 'Relative file path within the workspace (e.g., "reports/summary.txt")'
            },
            content: {
                type: 'STRING',
                description: 'Text content to write to the file'
            }
        },
        required: ['path', 'content']
    }
};

const organizeFileDeclaration = {
    name: 'organize_file',
    description: 'Move and rename a file from the inbound folder into the proper project folder. Creates the folder structure automatically. The file will be renamed to "[ProjectName] NewFileName" format.',
    parameters: {
        type: 'OBJECT',
        properties: {
            old_path: {
                type: 'STRING',
                description: 'Current relative path of the file (e.g., "inbound/document.pdf")'
            },
            project_name: {
                type: 'STRING',
                description: 'Project name (e.g., "Alpha", "Project Beta", "ClientXYZ")'
            },
            doc_type: {
                type: 'STRING',
                description: 'Document category (e.g., "Invoices", "Contracts", "Reports", "Proposals")'
            },
            new_file_name: {
                type: 'STRING',
                description: 'New descriptive file name including extension (e.g., "Invoice-Jan2025.pdf")'
            }
        },
        required: ['old_path', 'project_name', 'doc_type', 'new_file_name']
    }
};

const readActivityLogDeclaration = {
    name: "read_activity_log",
    description: "เรียกดูประวัติการทำงานล่าสุดของ AI (Activity Log) เช่น การย้ายไฟล์ การสร้างโฟลเดอร์ หรือการขออนุมัติจาก User ใช้เพื่อตรวจสอบว่างานไหนทำไปแล้วบ้าง เพื่อประหยัด Token และไม่ทำงานซ้ำซ้อน",
    parameters: {
        type: "OBJECT",
        properties: {
            limit: {
                type: "NUMBER",
                description: "จำนวนรายการล่าสุดที่ต้องการอ่าน (ค่าเริ่มต้นคือ 10)"
            }
        }
    }
};

module.exports = {
    listFiles,
    readDocument,
    writeFile,
    organizeFile,
    readActivityLogTool,
    listFilesDeclaration,
    readDocumentDeclaration,
    writeFileDeclaration,
    organizeFileDeclaration,
    readActivityLogDeclaration
};
