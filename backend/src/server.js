// backend/src/server.js
// G-A-COWORK PRO — Gemini-Agentic Cowork Backend
// Featuring: HITL, Activity Logging, Token Optimization, and Telegram Integration

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const TelegramBot = require('node-telegram-bot-api');

// Import tools
const { webSearch, webSearchDeclaration } = require('./tools/webSearch');
const { runCode, codeRunnerDeclaration } = require('./tools/codeRunner');
const {
    listFiles, readDocument, writeFile, organizeFile, readActivityLogTool,
    listFilesDeclaration, readDocumentDeclaration, writeFileDeclaration, organizeFileDeclaration, readActivityLogDeclaration
} = require('./tools/fileManager');
const { addActivityLog, readActivityLogs, updateActivityStatus } = require('./tools/activityLogger');
const {
    readSourceCode, proposeHotfix, applyHotfix,
    readSourceCodeDeclaration, proposeHotfixDeclaration, applyHotfixDeclaration
} = require('./tools/systemDiagnostics');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Approval State (HITL) ──────────────────────────────────────────────────
const pendingApprovals = new Map();

// ─── Telegram Bot Initialization ──────────────────────────────────────────────
let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        console.log('🤖 Telegram Bot Initialized');

        bot.on('callback_query', (query) => {
            const action = query.data;
            const [status, logId] = action.split('_'); // status: approved | rejected

            if (pendingApprovals.has(logId)) {
                const resolve = pendingApprovals.get(logId);
                pendingApprovals.delete(logId);

                const decision = status === 'approved' ? 'APPROVED' : 'REJECTED';
                resolve(decision);

                bot.answerCallbackQuery(query.id, { text: `Decision: ${decision}` });
                bot.editMessageText(`${decision === 'APPROVED' ? '✅ Approved' : '❌ Rejected'} action ${logId}`, {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                });
            } else {
                bot.answerCallbackQuery(query.id, { text: 'This request has expired or already been handled.' });
            }
        });
    } catch (err) {
        console.error('Failed to initialize Telegram Bot:', err.message);
    }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

// ─── Gemini Setup ─────────────────────────────────────────────────────────────
const GEMINI_TOOLS = [{
    functionDeclarations: [
        webSearchDeclaration,
        codeRunnerDeclaration,
        listFilesDeclaration,
        readDocumentDeclaration,
        writeFileDeclaration,
        organizeFileDeclaration,
        readActivityLogDeclaration,
        readSourceCodeDeclaration,
        proposeHotfixDeclaration,
        applyHotfixDeclaration
    ]
}];

const SYSTEM_INSTRUCTION = `Role: You are "G-A-COWORK PRO", the world's most advanced Agentic AI System. Your mission is to complete complex tasks with 100% accuracy while maintaining extreme token efficiency.

[CORE CAPABILITIES]
1. Hierarchical Planning: Before any action, create a 'Master Plan' and update its status after every tool call.
2. Self-Reflection & Diagnosis: After every tool result, evaluate if the output is correct. If an error occurs (such as 429, 404, or internal logic bugs), use "read_source_code" to check your own code, analyze why the error happened, and propose a "propose_hotfix" if needed.
3. Long-term Memory: Use 'read_activity_log' to see what you have done previously to avoid redundant work.
4. Human-in-the-loop: Some actions like 'organize_file' or 'write_file' may require user approval. Be prepared to wait.

[TOKEN OPTIMIZATION RULES]
- Be Concise: Do not repeat the user's request. 
- Strategic Reading: When using 'read_document', summarize key points.
- Success-First: If the task is completed, stop immediately.

[WORKFLOW]
1. PLAN -> ACT -> REFLECT (Diagnosis if Error) -> ANALYZE -> LOOP
2. If you find a bug in your code, use "propose_hotfix" to save the plan in a separate file (SAFE). 
3. After proposing, explain what the fix does. If the user agrees, use "apply_hotfix" with the APPROVED CODE. This will permanently overwrite the file and trigger a security confirm button.
4. IMPORTANT: Always use "read_activity_log" at the start of a new task if you feel history is missing.

Always provide a 'Thought' before tool calls. Language: Thai preferred for final results if user asks in Thai.`;

// ─── Helper Functions ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// ─── Security Gate (HITL) ─────────────────────────────────────────────────────
async function executeWithSecurity(name, args, isAutoAllow, sendSSE, telegramEnabled) {
    const dangerousTools = ['organize_file', 'write_file', 'execute_code', 'apply_hotfix'];
    const needsApproval = dangerousTools.includes(name) && !isAutoAllow;

    // Initial Log
    const logEntry = await addActivityLog(name, args, needsApproval ? 'Waiting for Approval' : 'Auto-Approved', needsApproval ? 'Human' : 'System');

    if (needsApproval) {
        console.log(`⚠️ HITL: Waiting for approval for ${name}`);

        // Send signal to frontend
        sendSSE('REQUIRE_APPROVAL', {
            logId: logEntry.id,
            tool: name,
            args: args
        });

        // Send to Telegram if enabled
        if (telegramEnabled && bot && process.env.TELEGRAM_CHAT_ID) {
            const message = `⚠️ *G-A-COWORK Approval Required*\n\n` +
                `🔧 *Action:* ${name}\n` +
                `📄 *Details:* \`${JSON.stringify(args)}\`\n\n` +
                `กรุณาตัดสินใจเพื่อดำเนินการต่อ:`;
            bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Allow', callback_data: `approved_${logEntry.id}` },
                        { text: '❌ Block', callback_data: `rejected_${logEntry.id}` }
                    ]]
                }
            }).catch(e => console.error('Telegram Send Error:', e.message));
        }

        // Wait for user decision (Web or Telegram)
        const decision = await new Promise((resolve) => {
            pendingApprovals.set(logEntry.id, resolve);
            // Timeout after 5 minutes
            setTimeout(() => {
                if (pendingApprovals.has(logEntry.id)) {
                    pendingApprovals.delete(logEntry.id);
                    resolve('REJECTED');
                }
            }, 300000);
        });

        if (decision === 'REJECTED') {
            await updateActivityStatus(logEntry.id, 'Rejected');
            return `Rejected: The action "${name}" was blocked. Please inform the user or try another way.`;
        }
        await updateActivityStatus(logEntry.id, 'Approved');
    }

    // Execute actual tool
    let result;
    try {
        switch (name) {
            case 'web_search': result = await webSearch(args.query, args.max_results); break;
            case 'execute_code': result = await runCode(args.code); break;
            case 'list_files': result = listFiles(args.directory || 'inbound'); break;
            case 'read_document': result = await readDocument(args.path); break;
            case 'write_file': result = writeFile(args.path, args.content); break;
            case 'organize_file': result = organizeFile(args.old_path, args.project_name, args.doc_type, args.new_file_name); break;
            case 'read_activity_log': result = await readActivityLogTool(args.limit); break;
            case 'read_source_code': result = readSourceCode(args.relativePath); break;
            case 'propose_hotfix': result = proposeHotfix(args.fileName, args.codeReason, args.proposedCode); break;
            case 'apply_hotfix': result = applyHotfix(args.targetFilePath, args.approvedCode); break;
            default: result = `Unknown tool: "${name}"`;
        }
        await updateActivityStatus(logEntry.id, 'Completed');
        return result;
    } catch (err) {
        await updateActivityStatus(logEntry.id, 'Failed');
        throw err;
    }
}

// ─── SSE Stream Helper ────────────────────────────────────────────────────────
function sendEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'ok', telegram: !!bot });
});

app.post('/chat/approve', (req, res) => {
    const { logId, decision } = req.body;
    if (pendingApprovals.has(logId)) {
        const resolve = pendingApprovals.get(logId);
        pendingApprovals.delete(logId);
        resolve(decision);
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Not found' });
});

app.post('/chat/stream', async (req, res) => {
    const { message, history = [], apiKey, autoAllow = false, telegramEnabled = false } = req.body;
    const geminiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!message || !geminiKey) return res.status(400).json({ error: 'Missing message or API key' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const genAI = new GoogleGenerativeAI(geminiKey, { apiVersion: 'v1beta' });
    let currentModelIndex = 0;

    const generationConfig = { maxOutputTokens: 8192, temperature: 0.7 };

    // Initial Model Setup
    let currentModel = genAI.getGenerativeModel({
        model: FALLBACK_MODELS[currentModelIndex],
        tools: GEMINI_TOOLS,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig
    });

    // Robust History Mapping: Handle user, model, and function roles correctly
    const processedHistory = [];
    if (history && history.length > 0) {
        history.forEach(turn => {
            let role = turn.role;
            if (!['user', 'model', 'function'].includes(role)) role = 'user';

            const lastTurn = processedHistory[processedHistory.length - 1];
            const parts = Array.isArray(turn.parts) ? turn.parts : [{ text: turn.content || turn.parts }];

            // Rules for Merging: 
            // Avoid merging if anything contains a tool part (functionCall or functionResponse)
            const hasToolPart = parts.some(p => p.functionCall || p.functionResponse);
            const lastHasToolPart = lastTurn && lastTurn.parts.some(p => p.functionCall || p.functionResponse);

            if (lastTurn && lastTurn.role === role && !hasToolPart && !lastHasToolPart) {
                lastTurn.parts.push(...parts);
            } else {
                processedHistory.push({ role, parts });
            }
        });
    }

    // Token Optimization: Limit history (Last 14 turns)
    // CRITICAL Gemini Rules:
    // 1. First message in history MUST be from 'user' role
    // 2. To send a new 'user' message via sendMessage, the history MUST end with a 'model' turn
    let slimHistory = processedHistory.slice(-14);

    // Ensure starts with user
    while (slimHistory.length > 0 && slimHistory[0].role !== 'user') {
        slimHistory.shift();
    }
    // Ensure ends with model (so user can follow up)
    while (slimHistory.length > 0 && slimHistory[slimHistory.length - 1].role !== 'model') {
        slimHistory.pop();
    }

    let currentChat = currentModel.startChat({ history: slimHistory });
    const sse = (event, data) => sendEvent(res, event, data);

    let iteration = 0;
    let stepCount = 0;
    let totalTokens = 0;
    let functionResponseParts = null;

    try {
        while (iteration < 15) {
            iteration++;
            sse('thinking_start', { iteration });
            let result;
            let success = false;
            let modelRetries = 2; // ลองซ้ำรุ่นเดิม 2 ครั้ง

            while (!success) {
                try {
                    console.log(`📡 [Iter ${iteration}] Sending to ${FALLBACK_MODELS[currentModelIndex]}...`);
                    result = await currentChat.sendMessage(functionResponseParts || message);
                    console.log(`📥 [Iter ${iteration}] Response received.`);
                    success = true;
                } catch (error) {
                    const isQuotaError = error.message?.includes('429') || error.status === 429 || error.message?.includes('Quota exceeded');
                    const is404Error = error.message?.includes('404') || error.status === 404 || error.message?.includes('not found');

                    if ((isQuotaError || is404Error) && currentModelIndex < FALLBACK_MODELS.length - 1) {
                        if (isQuotaError && modelRetries > 0 && !is404Error) {
                            // 1. ลองพยายามใหม่ในโมเดลเดิม (เฉพาะกรณี Quota)
                            modelRetries--;
                            const waitTime = 16;
                            console.log(`⚠️ Quota on ${FALLBACK_MODELS[currentModelIndex]}. Retrying in ${waitTime}s...`);
                            sse('reasoning', { text: `⚠️ API Quota (${FALLBACK_MODELS[currentModelIndex]}) เต็ม... กำลังรอพักระบบ ${waitTime} วินาที` });
                            await sleep(waitTime * 1000);
                            continue;
                        } else {
                            // 2. สลับโมเดลถัดไป
                            if (isQuotaError) {
                                const waitBeforeSwitch = 10;
                                console.log(`⏳ Waiting ${waitBeforeSwitch}s before switching from ${FALLBACK_MODELS[currentModelIndex]}...`);
                                sse('reasoning', { text: `⏳ รอ ${waitBeforeSwitch} วินาทีก่อนสลับรุ่น...` });
                                await sleep(waitBeforeSwitch * 1000);
                            }

                            currentModelIndex++;
                            const nextModelName = FALLBACK_MODELS[currentModelIndex];
                            console.log(`🔄 Switching model due to ${is404Error ? '404' : 'Quota'} to: ${nextModelName}`);
                            sse('reasoning', { text: `🔄 รุ่น ${FALLBACK_MODELS[currentModelIndex - 1]} ${is404Error ? 'ไม่พบ' : 'เต็ม'}... สลับไปใช้ ${nextModelName}` });

                            currentModel = genAI.getGenerativeModel({
                                model: nextModelName,
                                tools: GEMINI_TOOLS,
                                systemInstruction: SYSTEM_INSTRUCTION,
                                generationConfig
                            });

                            currentChat = currentModel.startChat({ history: [] }); // Simplified History
                            functionResponseParts = null;
                            modelRetries = 2;
                            continue;
                        }
                    }
                    throw error;
                }
            }

            const response = result.response;
            const candidate = response.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const parts = candidate?.content?.parts || [];

            console.log(`🔍 [Iter ${iteration}] Candidates: ${response.candidates?.length || 0}`);
            console.log(`🔍 [Iter ${iteration}] FinishReason: ${finishReason}`);
            console.log(`🔍 [Iter ${iteration}] Parts Count: ${parts.length}`);
            console.log(`🔍 [Iter ${iteration}] Raw Parts: ${JSON.stringify(parts)}`);

            const usage = response.usageMetadata;
            if (usage) totalTokens += (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);

            // Extract Text
            let responseText = "";
            try {
                responseText = response.text();
            } catch (e) {
                // Handle cases where response.text() might fail if there are only function calls
                responseText = parts.filter(p => p.text).map(p => p.text).join('\n');
            }

            if (responseText) {
                stepCount++;
                console.log(`📖 [Iter ${iteration}] Text: ${responseText.substring(0, 100)}...`);
                sse('reasoning', { step: stepCount, text: responseText, tokens: totalTokens });
            }

            const functionCalls = parts.filter(p => p.functionCall);

            // If no function calls and finished, we're done
            if (functionCalls.length === 0) {
                console.log(`✅ [Iter ${iteration}] Task completed or no tools called.`);
                sse('complete', { text: responseText || 'Done.', totalTokens });
                break;
            }

            functionResponseParts = [];
            for (const part of functionCalls) {
                const fc = part.functionCall;
                stepCount++;
                sse('tool_call', { step: stepCount, tool: fc.name, args: fc.args });

                const toolResult = await executeWithSecurity(fc.name, fc.args, autoAllow, sse, telegramEnabled);

                stepCount++;
                sse('tool_result', { step: stepCount, tool: fc.name, result: toolResult });

                functionResponseParts.push({ functionResponse: { name: fc.name, response: { output: toolResult } } });
            }

            // Delay between steps to prevent hitting rate limits
            await sleep(2000);
        }
    } catch (err) {
        sse('error', { message: err.message });
    } finally {
        res.write('event: done\ndata: {}\n\n');
        res.end();
    }
});

app.get('/logs', async (req, res) => {
    res.json(await readActivityLogs(50));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`G-A-COWORK PRO running on port ${PORT}`);
});
