export class SnapshotGenerator {
    constructor(sendFn) {
        this.send = sendFn;
    }

    async generate(scopeVariables, filename = 'test.spec.js') {
        console.log('SnapshotGenerator: Generating via In-Context Serializer...');
        const declarations = [];

        for (const [name, remoteObject] of Object.entries(scopeVariables)) {
            // We use callFunctionOn to serialize the object *inside* the V8 context
            // This handles cycles and types much better than round-tripping.
            const result = await this.send('Runtime.callFunctionOn', {
                objectId: remoteObject.objectId,
                functionDeclaration: `
function() {
    const seen = new WeakMap();
    
    function serialize(val, path) {
        if (val === undefined) return 'undefined';
        if (val === null) return 'null';
        
        if (typeof val === 'function') {
            return '() => { /* function */ }';
        }
        
        if (typeof val !== 'object') {
            if (typeof val === 'string') return JSON.stringify(val);
            if (typeof val === 'symbol') return \`'\${String(val)}'\`;
            return String(val);
        }
        
        if (val instanceof Date) {
            return \`new Date('\${val.toISOString()}')\`;
        }
        
        if (val instanceof RegExp) {
            return val.toString();
        }

        if (seen.has(val)) {
            return \`/* Circular(\${seen.get(val)}) */ null\`;
        }
        seen.set(val, path);
        
        if (Array.isArray(val)) {
            const elements = val.map((v, i) => serialize(v, \`\${path}[\${i}]\`));
            return \`[\${elements.join(', ')}]\`;
        }
        
        // Plain object
        const parts = [];
        for (const key in val) {
            if (key === '__proto__') continue;
            // Basic property check
            try {
                const k = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : \`'\${key}'\`;
                const v = serialize(val[key], \`\${path}.\${key}\`);
                parts.push(\`\${k}: \${v}\`);
            } catch (e) {
                // Ignore access errors
            }
        }
        return \`{ \${parts.join(', ')} }\`;
    }
    
    return serialize(this, '${name}');
}
`,
                returnByValue: true // We want the serialized string back!
            });

            if (result.exceptionDetails) {
                console.error(`Error serializing ${name}:`, result.exceptionDetails);
                declarations.push(`const ${name} = undefined; /* Serialization error */`);
            } else {
                declarations.push(`const ${name} = ${result.result.value};`);
            }
        }

        console.log('SnapshotGenerator: Generation complete.');

        return `
import { test, expect } from 'vitest';

test('snapshot state', () => {
    ${declarations.join('\n    ')}
    
    // Add assertions here
    console.log('Snapshot loaded');
});
`;
    }
}
