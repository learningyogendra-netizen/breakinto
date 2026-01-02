import breakinto from '../src/index.js';

async function main() {
    const message = 'Hello from the demo!';
    const counter = 42;
    const user = { name: 'Alice', role: 'admin' };

    console.log('Before breakinto');

    // Pause execution here - no context passed!
    // The inspector should allow us to access 'message', 'counter', 'user' directly.
    await breakinto();

    console.log('After breakinto');
    // We will try to modify 'user' in the REPL
    console.log('HOTFIXED user:', user);
}

main().catch(console.error);
