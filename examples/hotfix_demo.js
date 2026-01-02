import breakinto from '../src/index.js';

export function greet() {
    console.log('Hello Yogendra!');
}

async function main() {
    console.log('Before breakinto');
    await breakinto();
    console.log('After breakinto');
    greet();
}

main().catch(console.error);
