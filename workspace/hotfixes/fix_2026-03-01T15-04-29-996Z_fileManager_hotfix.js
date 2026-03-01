HOTFIX PROPOSAL
Reason: ปรับปรุงการโหลดโมดูล activityLogger ให้มีประสิทธิภาพมากขึ้น และกำหนดค่าคงที่สำหรับขนาดไฟล์สูงสุดที่อ่านได้ เพื่อความชัดเจนและง่ายต่อการบำรุงรักษาโค้ด

Proposed Code:

// backend/src/tools/fileManager.js
// File management tool for the /workspace directory

const fs = require('fs');
const path = require('path');
const { readActivityLogs } = require('./activityLogger'); // Moved this require to the top

// Workspace root (Docker volume mount point)
const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || path.join(__dirname, '../../workspace');
const INBOUND_DIR = path.join(WORKSPACE_ROOT, 'inbound');
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, 'projects');

// Constants
const MAX_FILE_SIZE_READ_MB = 10; // Max file size in MB for reading documents

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

        if (stats.size > MAX_FILE_SIZE_READ_MB * 1024 * 1024) { // Using the new constant
            return `File too large to read (${(stats.size / 1024 / 1024).toFixed(1)} MB). Max size: ${MAX_FILE_SIZE_READ_MB} MB`;
        }

        if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            return `📃 File: ${filePath}\nSize: ${(stats.size / 1024).toFixed(1)} KB\n\nContent:\n---\n${content.slice(0, 5000)}${content.length > 5000 ? '\n... [truncated, file continues]' : ''}`;
        }

        if (ext === '.pdf') {
            try {
                const pdfParse = require('pdf-parse');
                const buffer = fs.readFileSync(fullPath);
                const data = await pdfParse(buffer);
                const text = data.text.slice(0, 5000);
                return `📄 PDF: ${filePath}\nPages: ${data.numpages} | Size: ${(stats.size / 1024).toFixed(1)} KB\n\nExtracted Text:\n---\n${text}${data.text.length > 5000 ? '\n... [truncated]' : ''}`;
            } catch (e) {
                return `Error reading PDF: ${e.message}`;
            }
        }

        if (ext === '.docx') {
            try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ path: fullPath });
                const text = result.value.slice(0, 5000);
                return `📝 DOCX: ${filePath}\nSize: ${(stats.size / 1024).toFixed(1)} KB\n\nExtracted Text:\n---\n${text}${result.value.length > 5000 ? '\n... [truncated]' : ''}`;
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

        // Move the file (copy + delete)
        fs.copyFileSync(sourcePath, destPath);
        fs.unlinkSync(sourcePath);

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
        // const { readActivityLogs } = require('./activityLogger'); // This line was moved to the top
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