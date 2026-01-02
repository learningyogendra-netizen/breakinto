import inspector from 'node:inspector';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function breakinto(options = {}) {
    if (inspector.url()) {
        console.log('Breakinto: Inspector already open at', inspector.url());
        inspector.close();
    }

    // Try to find a free port synchronously by trial and error
    let port = 0;
    const host = '127.0.0.1';
    const MAX_RETRIES = 10;

    for (let i = 0; i < MAX_RETRIES; i++) {
        const p = 9229 + Math.floor(Math.random() * 1000);
        try {
            // We use inspector.open in blocking mode. 
            // However, if port is busy, it throws.
            // But we can't 'test' it without blocking (wait=true).
            // Actually, we can open(..., false) first to check success, then close, then open(..., true)?
            // No, race condition.
            // We just have to Spawn CLI first, then Try Open.
            // But if Open fails, CLI is already spawned with wrong port.
            // This is tricky. 

            // Allow user to specify port?
            port = p;

            // To be safe, we really should use the Random Port Strategy blindly.
            // If it fails, we abort.
            break;
        } catch (e) {
            // ignore
        }
    }

    // Using a random port in range 9230-10230. Collision unlikely.

    const cliPath = join(__dirname, 'cli.js');
    const child = spawn(process.execPath, [cliPath, `${host}:${port}`], {
        stdio: 'inherit',
        env: { ...process.env, BREAKINTO_CHILD: 'true' }
    });

    console.log(`Breakinto: Waiting for debugger connection on port ${port}...`);

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
