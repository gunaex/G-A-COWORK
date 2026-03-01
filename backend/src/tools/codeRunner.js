// backend/src/tools/codeRunner.js
// Safe JavaScript code execution in a sandbox

const { VM } = (() => {
    try {
        return require('vm2');
    } catch {
        return { VM: null };
    }
})();

/**
 * Execute JavaScript code safely
 * @param {string} code - JavaScript code to execute
 * @returns {string} Execution output
 */
async function runCode(code) {
    // Capture console.log output
    const logs = [];
    const originalLog = console.log;

    try {
        // Use Node's built-in vm for sandboxing
        const vm = require('vm');
        const output = [];

        const sandbox = {
            console: {
                log: (...args) => output.push(args.map(a =>
                    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
                ).join(' ')),
                error: (...args) => output.push('ERROR: ' + args.join(' ')),
                warn: (...args) => output.push('WARN: ' + args.join(' ')),
            },
            Math,
            JSON,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Date,
            RegExp,
            Set,
            Map,
            Promise,
            setTimeout: () => { },
            clearTimeout: () => { },
        };

        const script = new vm.Script(code, { timeout: 5000 });
        const result = script.runInNewContext(sandbox, { timeout: 5000 });

        if (output.length > 0) {
            return `✅ Execution Output:\n${output.join('\n')}`;
        } else if (result !== undefined) {
            return `✅ Result: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`;
        } else {
            return '✅ Code executed successfully (no output)';
        }
    } catch (error) {
        return `❌ Execution Error:\n${error.name}: ${error.message}`;
    }
}

// Tool declaration for Gemini function calling
const codeRunnerDeclaration = {
    name: 'execute_code',
    description: 'Execute JavaScript code in a secure sandbox and return the output. Use this for calculations, data processing, algorithm testing, or any programmatic task.',
    parameters: {
        type: 'OBJECT',
        properties: {
            code: {
                type: 'STRING',
                description: 'JavaScript code to execute. Use console.log() to produce output. The code runs in a sandboxed environment.'
            },
            description: {
                type: 'STRING',
                description: 'Brief description of what this code does (for the trace log)'
            }
        },
        required: ['code']
    }
};

module.exports = { runCode, codeRunnerDeclaration };
