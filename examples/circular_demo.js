import breakinto from '../src/index.js';

async function main() {
    const a = { name: 'A' };
    const b = { name: 'B' };
    a.friend = b;
    b.friend = a;

    console.log('Before breakinto (circular)');
    await breakinto();
    console.log('After breakinto');
}

main().catch(console.error);
