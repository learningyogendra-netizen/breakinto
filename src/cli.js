import WebSocket from 'ws';
import repl from 'node:repl';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import chalk from 'chalk';
import { showContext } from './commands/whereami.js';

const targetArg = process.argv[2];

if (!targetArg) {
    console.error(chalk.red('Usage: node cli.js <host:port>'));
    process.exit(1);
}

const [host, port] = targetArg.split(':');
let ws;
const pendingRequests = new Map();
let nextId = 1;

// Map scriptId -> url
const scripts = new Map();

// Current state
let callFrameId = null;
let location = null;
let r = null;

async function main() {
    let wsUrl;
    while (!wsUrl) {
        try {
            wsUrl = await getInspectorUrl(host, port);
        } catch (e) {
            // Wait and retry
            await new Promise(r => setTimeout(r, 100));
        }
    }

    ws = new WebSocket(wsUrl);
    setupWs(ws);
}

function getInspectorUrl(host, port) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://${host}:${port}/json/list`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const list = JSON.parse(data);
                    if (list.length > 0 && list[0].webSocketDebuggerUrl) {
                        resolve(list[0].webSocketDebuggerUrl);
                    } else {
                        reject(new Error('No debuggable target found'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function setupWs(ws) {
    ws.on('open', () => {
        send('Debugger.enable');
        send('Runtime.enable');
        send('Runtime.runIfWaitingForDebugger');
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        if (message.id && pendingRequests.has(message.id)) {
            const { resolve, reject } = pendingRequests.get(message.id);
            pendingRequests.delete(message.id);
            if (message.error) {
                reject(message.error);
            } else {
                resolve(message.result);
            }
        } else if (message.method === 'Debugger.scriptParsed') {
            const params = message.params;
            if (params.url) {
                scripts.set(params.scriptId, params.url);
            }
        } else if (message.method === 'Debugger.paused') {
            handlePaused(message.params);
        } else if (message.method === 'Debugger.resumed') {
            process.exit(0);
        }
    });
}

function handlePaused(params) {
    const callFrames = params.callFrames;

    // Find breakinto frame
    let breakintoFrameIndex = -1;
    for (let i = 0; i < callFrames.length; i++) {
        if (callFrames[i].functionName === 'breakinto') {
            breakintoFrameIndex = i;
            break;
        }
    }

    // Caller is immediately after breakinto in synchronous stack!
    const targetFrameIndex = breakintoFrameIndex !== -1 ? breakintoFrameIndex + 1 : 0;
    const targetFrame = callFrames[targetFrameIndex] || callFrames[0];
    callFrameId = targetFrame.callFrameId;

    // Capture scriptId for hot-reloading
    const scriptId = targetFrame.location.scriptId;
    // Capture scopeChain for snapshot
    const scopeChain = targetFrame.scopeChain;

    let url = targetFrame.url;
    if (!url && scripts.has(scriptId)) {
        url = scripts.get(scriptId);
    }

    location = {
        scriptId,
        scopeChain,
        file: url && url.startsWith('file://') ? fileURLToPath(url) : url,
        line: targetFrame.location.lineNumber + 1,
        column: targetFrame.location.columnNumber + 1
    };

    console.log(chalk.yellow(`\nPaused at ${chalk.bold(location.file)}:${chalk.bold(location.line)}`));

    if (!r) {
        startRepl();
    } else {
        r.displayPrompt();
    }
}

function startRepl() {
    r = repl.start({
        prompt: chalk.blue('breakinto> '),
        useGlobal: false,
        eval: async (cmd, context, filename, callback) => {
            cmd = cmd.trim();
            if (!cmd) return callback(null);

            try {
                const result = await send('Debugger.evaluateOnCallFrame', {
                    callFrameId,
                    expression: cmd,
                    includeCommandLineAPI: true,
                    generatePreview: true
                });

                if (result.exceptionDetails) {
                    return callback(result.exceptionDetails.exception.description);
                }

                const remoteObj = result.result;
                let output;
                if (remoteObj.type === 'object' && remoteObj.subtype === 'error') {
                    output = remoteObj.description;
                } else if (remoteObj.value !== undefined) {
                    output = remoteObj.value;
                } else if (remoteObj.type === 'undefined') {
                    output = undefined;
                } else {
                    // It's a complex object (type='object' or 'function') with no value sent back.
                    // We attempt to inspect it on the server side using util.inspect.
                    try {
                        const inspectResult = await send('Runtime.callFunctionOn', {
                            objectId: remoteObj.objectId,
                            functionDeclaration: `function() { return this; }`,
                            returnByValue: true
                        });

                        if (inspectResult.result && inspectResult.result.value !== undefined) {
                            output = inspectResult.result.value;
                        } else {
                            output = remoteObj.description || remoteObj.type;
                        }
                    } catch (err) {
                        // Fallback if anything goes wrong
                        output = remoteObj.description || remoteObj.type;
                    }
                }

                callback(null, output);
            } catch (e) {
                callback(e);
            }
        }
    });

    r.on('SIGINT', () => {
        send('Debugger.resume');
    });

    r.defineCommand('reload', {
        help: 'Reload source file and hot-patch function',
        async action() {
            if (!location || !location.file || !location.scriptId) {
                console.log('No source file available to reload.');
                this.displayPrompt();
                return;
            }

            try {
                const fs = await import('node:fs');
                const content = fs.readFileSync(location.file, 'utf8');

                console.log(`Reloading ${location.file}...`);

                const result = await send('Debugger.setScriptSource', {
                    scriptId: location.scriptId,
                    scriptSource: content
                });

                if (result.exceptionDetails) {
                    console.error('Hot-fix failed:', result.exceptionDetails);
                } else {
                    console.log('Hot-fix applied! (Status:', result.status || 'OK', ')');
                    if (result.stackChanged) {
                        console.log('Stack changed. You may need to step out/in.');
                    }
                }
            } catch (err) {
                console.error('Error reloading:', err.message);
            }
            this.displayPrompt();
        }
    });

    r.defineCommand('snap', {
        help: 'Snapshot current scope to a test file: .snap [filename]',
        async action(filename) {
            filename = filename || 'breakinto_snap.test.js';
            console.log(`Generating snapshot to ${filename}...`);

            if (!location || !location.scopeChain) {
                console.error('No scope information available.');
                this.displayPrompt();
                return;
            }

            try {
                const { SnapshotGenerator } = await import('./snapshot.js');
                const generator = new SnapshotGenerator(send);

                const scopeVariables = {};

                for (const scope of location.scopeChain) {
                    if (scope.type === 'global') break;

                    // Get variables in this scope
                    const res = await send('Runtime.getProperties', {
                        objectId: scope.object.objectId,
                        ownProperties: true
                    });

                    if (res.result) {
                        for (const prop of res.result) {
                            if (prop.value && !scopeVariables[prop.name]) {
                                scopeVariables[prop.name] = prop.value;
                            }
                        }
                    }
                }

                const code = await generator.generate(scopeVariables, filename);

                const fs = await import('node:fs');
                fs.writeFileSync(filename, code);
                console.log(`Snapshot saved to ${filename}`);
            } catch (e) {
                console.error('Snapshot failed:', e);
            }
            this.displayPrompt();
        }
    });

    r.defineCommand('continue', {
        help: 'Resume execution',
        action() {
            send('Debugger.resume');
        }
    });

    r.defineCommand('c', {
        help: 'Resume execution',
        action() {
            send('Debugger.resume');
        }
    });

    r.defineCommand('whereami', {
        help: 'Show context',
        action() {
            showContext(location);
            this.displayPrompt();
        }
    });

    if (location) {
        showContext(location);
    }
}

main().catch(console.error);
