# 🤖 G-A-COWORK PRO — Functionality Summary

G-A-COWORK PRO is a state-of-the-art Agentic AI Workspace designed for autonomous task execution, secure file management, and remote human oversight.

## 🚀 Core Capabilities

### 1. Agentic Loop (Self-Correcting)
- **Autonomous Planning**: Gemini 2.0 Flash generates a "Master Plan" and updates it dynamically.
- **Self-Reflection**: After every tool call, the agent evaluates the result. If it fails, it reformulates a new approach (up to 3 retries per step).
- **Token Efficiency**: Smart history management limits context to the most recent relevant turns (~10 turns).

### 2. HITL (Human-in-the-Loop) Security Gate
- **Protection**: Dangerous actions (writing files, moving/renaming, running code) require explicit approval.
- **Dual Approval Channels**:
  - **Web Dashboard**: Approval Modal pops up in the browser.
  - **Telegram Bot**: Remote approval from anywhere via inline buttons (Allow/Block).
- **Auto-Approve Mode**: Toggleable mode for safe, fully autonomous batch processing.

### 3. Integrated Toolset
- 🔍 **Web Search**: Real-time information retrieval via Tavily REST API.
- 💻 **Code Sandbox**: Safe JavaScript execution in a Node.js `vm` environment.
- 📂 **File Manager**:
  - `list_files`: Scans workspace for input/output.
  - `read_document`: Rich text extraction from PDF, DOCX, and TXT.
  - `write_file`: Document generation and logging.
  - `organize_file`: Smart categorization into `projects/{ProjectName}/{DocType}/`.
- 📜 **Activity Logger**: Maintains a permanent `activity.log` for audit and "System Memory".

## 🛡️ Operational Memory
The agent can call `read_activity_log` to recall what it has already done within the current day or session. This prevents redundant tool calls and provides context for status reports like: *"วันนี้คุณจัดการไฟล์โปรเจกต์ Alpha ไปถึงไหนแล้ว?"*

## 🌐 Remote Accessibility (Telegram)
- **Status Updates**: Real-time notifications for approval requests.
- **Remote Control**: One-tap approval/blocking from your phone.
- **Privacy**: Feature is fully toggleable to avoid interruptions during meetings.

---
*G-A-COWORK: Your autonomous AI coworker.*
