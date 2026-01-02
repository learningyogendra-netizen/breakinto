import inspector from 'node:inspector';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { getFreePort } from './utils.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function breakinto(options = {}) {
    if (inspector.url()) {
        console.log('Breakinto: Inspector already open at', inspector.url());
        inspector.close();
    }

    // Get a free port from the OS
    const host = '127.0.0.1';
    const port = await getFreePort();

    const cliPath = join(__dirname, 'cli.js');
    const child = spawn(process.execPath, [cliPath, `${host}:${port}`], {
        stdio: 'inherit',
        env: { ...process.env, BREAKINTO_CHILD: 'true' }
    });

    console.log(`Breakinto: Waiting for debugger connection on port ${port}...`);

    // Setup cleanup handlers to prevent orphaned processes
    const cleanup = () => {
        try {
            inspector.close();
        } catch (e) {
            // Inspector may already be closed
        }
        if (child && !child.killed) {
            child.kill();
        }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);

    try {
        // Open inspector in BLOCKING mode (wait=true)
        inspector.open(port, host, true);
    } catch (e) {
        console.error('Breakinto: Failed to open inspector on port ' + port, e);
        child.kill();
        return;
    }

    // Trigger pause. Client is connected. Stack is preserved.
    debugger;

    inspector.close();
    if (!child.killed) {
        child.kill();
    }
}
