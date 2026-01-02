# 🛑 Breakinto

**Node.js Interactive Debugger with Hot-Reload & REPL-Driven Development**

Debug Node.js without restart! Drop into an interactive REPL at any point to inspect local variables at runtime, edit code while running, and generate tests from live state. A better alternative to `node inspect` and `console.log` debugging.

[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- **🔍 Interactive REPL** - Pause execution anywhere and explore your application state with REPL-driven development
- **🎯 True Context Evaluation** - Inspect local variables at runtime on the paused call stack via V8 Inspector Protocol
- **🔥 Hot-Reload Debugging** - Edit code while running Node.js and reload it instantly without restarting your application
- **📸 Snap & Replay** - Generate tests from live state: serialize complex objects (including circular refs) into Vitest/Jest test files
- **👀 Code Context** - View surrounding source code with syntax highlighting
- **🎨 Beautiful Output** - Colorized terminal output with chalk
- **🏗️ Split-Process Architecture** - Robust separation between debugged app and CLI tool

---

## 🚀 Installation

```bash
npm install breakinto
```

---

## 📖 Quick Start

### 1. Add Breakinto to Your Code

```javascript
import breakinto from 'breakinto';

async function processOrder(order) {
    const user = await fetchUser(order.userId);
    const inventory = checkInventory(order.items);
    
    // 🛑 Pause here to inspect state
    breakinto();
    
    return finalizeOrder(user, inventory);
}
```

### 2. Run Your Application

```bash
node your-app.js
```

### 3. Interactive Session Starts Automatically

```
Breakinto: Waiting for debugger connection on port 9847...
 > 15     breakinto();
   16     
breakinto> user
{ id: 42, name: 'Alice', email: 'alice@example.com' }

breakinto> inventory
{ available: true, quantity: 5 }

breakinto> user.name = 'Bob'  // Modify state on the fly!
'Bob'

breakinto> .continue  // Resume execution
```

---

## 🎮 Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `.continue` | `.c` | Resume execution and close the debugger |
| `.whereami` | - | Show surrounding source code with current line highlighted |
| `.reload [file]` | - | Hot-reload the current source file (re-patches the running function) |
| `.snap [filename]` | - | Generate a snapshot test file from current scope variables |

### JavaScript Evaluation

Any JavaScript expression you type is evaluated **in the context of the paused call frame**:

```javascript
breakinto> const total = items.reduce((sum, item) => sum + item.price, 0)
150

breakinto> user.permissions.includes('admin')
true

breakinto> await fetchData(user.id)  // Async/await works!
{ ... }
```

---

## 📚 Usage Examples

### Example 1: Debugging a Bug

```javascript
import breakinto from 'breakinto';

async function calculateDiscount(user, cart) {
    const basePrice = cart.total;
    const discountRate = user.tier === 'premium' ? 0.2 : 0.1;
    
    // 🤔 Why is discount calculation wrong?
    breakinto();
    
    return basePrice * (1 - discountRate);
}
```

**In the REPL:**
```bash
breakinto> user.tier
'premium'

breakinto> cart.total
100

breakinto> discountRate
0.2

breakinto> basePrice * (1 - discountRate)
80  # ✅ Calculation looks correct!

breakinto> .continue
```

### Example 2: Hot-Patching Code

```javascript
import breakinto from 'breakinto';

async function greet(name) {
    breakinto();
    return `Hello, ${name}!`;
}

greet('World').then(console.log);
```

**Interactive Session:**
```bash
breakinto> .whereami
  4     async function greet(name) {
> 5         breakinto();
  6         return `Hello, ${name}!`;
  7     }

# Edit src/demo.js - change "Hello" to "Hi"

breakinto> .reload
✓ Reloaded successfully

breakinto> .continue
# Output: Hi, World!
```

### Example 3: Snapshot to Test

```javascript
import breakinto from 'breakinto';

async function main() {
    const user = { 
        name: 'Alice', 
        settings: { theme: 'dark' },
        friends: []
    };
    user.friends.push(user);  // Circular reference!
    
    breakinto();
}

main();
```

**In the REPL:**
```bash
breakinto> .snap user_state.test.js
✓ Snapshot saved to user_state.test.js

breakinto> .continue
```

**Generated Test File:**
```javascript
import { test, expect } from 'vitest';

test('snapshot state', () => {
    const user = { 
        name: 'Alice', 
        settings: { theme: 'dark' }, 
        friends: [/* Circular(user) */ null] 
    };
    
    // Add assertions here
    console.log('Snapshot loaded');
});
```

---

## 🏗️ Architecture

Breakinto uses a **split-process architecture** for maximum robustness:

```
┌────────────────────────────────────────────┐
│  Your Application Process                  │
│  ┌──────────────────────────────────────┐ │
│  │  await breakinto()                   │ │
│  │  1. Opens V8 Inspector on random port│ │
│  │  2. Spawns CLI tool subprocess       │ │
│  │  3. Triggers debugger; breakpoint    │ │
│  └──────────────────────────────────────┘ │
└────────────┬───────────────────────────────┘
             │ V8 Inspector Protocol
             │ (WebSocket)
┌────────────▼───────────────────────────────┐
│  CLI Tool (Separate Node Process)         │
│  ┌──────────────────────────────────────┐ │
│  │  1. Connects to Inspector WebSocket  │ │
│  │  2. Receives Debugger.paused event   │ │
│  │  3. Starts interactive REPL          │ │
│  │  4. Evaluates on paused call stack   │ │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Key Components

#### 📁 `src/index.js` - Main Entry Point
- Exports the `breakinto()` function
- Opens V8 Inspector on a random port
- Spawns the CLI tool as a child process
- Triggers `debugger;` statement to pause execution

#### 📁 `src/cli.js` - CLI Tool
- Connects to the Inspector WebSocket
- Handles `Debugger.paused` events
- Manages the REPL session
- Coordinates command execution

#### 📁 `src/repl.js` - REPL Engine
- Creates interactive prompt
- Evaluates expressions using `Debugger.evaluateOnCallFrame`
- Handles object inspection with `util.inspect`
- Registers custom commands

#### 📁 `src/inspector_client.js` - V8 Inspector Client
- Wraps `node:inspector` Session API
- Provides promisified `post()` method
- Manages Debugger/Runtime domain enable/disable

#### 📁 `src/snapshot.js` - Snapshot Generator
- Serializes complex objects in-context (avoids JSON limitations)
- Handles circular references with WeakMap tracking
- Generates Vitest/Jest compatible test files
- Uses `Runtime.callFunctionOn` for safe serialization

#### 📁 `src/commands/whereami.js` - Context Display
- Reads source files
- Highlights current execution line
- Shows surrounding code context

---

## 🔧 Advanced Usage

### Accessing Closure Variables

```javascript
function outer() {
    const secret = 'hidden';
    
    async function inner() {
        breakinto();
        console.log(secret);
    }
    
    return inner();
}
```

```bash
breakinto> secret
'hidden'  # ✅ Closure variables are accessible!
```

### Inspecting Complex Objects

```javascript
const complexObj = {
    nested: { deeply: { value: 42 } },
    circular: null,
    date: new Date(),
    regex: /test/gi
};
complexObj.circular = complexObj;

breakinto();
```

```bash
breakinto> complexObj
{
  nested: { deeply: { value: 42 } },
  circular: [Circular *1],
  date: 2026-01-02T05:15:49.000Z,
  regex: /test/gi
}
```

### Debugging Async Operations

```javascript
async function fetchUserData(userId) {
    const user = await db.users.findOne({ id: userId });
    
    breakinto();
    
    const posts = await db.posts.find({ authorId: user.id });
    return { user, posts };
}
```

```bash
breakinto> user
{ id: 123, name: 'Alice' }

breakinto> await db.posts.count({ authorId: user.id })
15  # Run async queries in the REPL!
```

---

## 🆚 Why Choose Breakinto?

### Better Than `console.log` Debugging
- **No more restart cycles** - Modify variables and test fixes instantly
- **Full context access** - See all local variables, not just what you logged
- **Interactive exploration** - Run any expression in the paused context
- **Professional workflow** - Generate reproducible tests from debugging sessions

### Alternative to `node inspect`
- **Automatic setup** - No need to restart with `--inspect` flag
- **Better UX** - Colorized output, syntax highlighting, and intuitive commands
- **Runtime inspection** - Drop breakpoints anywhere in running code
- **Hot-reload capability** - Edit and reload code without restarting the debugger
- **REPL-driven development** - Interactive workflow similar to Ruby's `pry` and Python's `ipdb`

### Debug Node.js Without Restart
Stop wasting time in the edit-restart-debug cycle:
1. Add `breakinto()` where you need to inspect
2. Run your app normally (no special flags needed)
3. Inspect local variables, modify state, and test fixes interactively
4. Hot-reload your changes and continue debugging
5. Generate test snapshots from live state

---

## 🎯 Use Cases

### 1. **Production Debugging** (with caution)
Add breakinto conditionally to debug production issues:
```javascript
if (process.env.DEBUG_USER === userId) {
    breakinto();
}
```

### 2. **Learning Codebases**
Explore unfamiliar code by dropping breakpoints:
```javascript
// What does this legacy function even do?
breakinto();
```

### 3. **Test-Driven Debugging**
Capture failing state as a test:
```javascript
if (isUnexpectedState) {
    breakinto();  // .snap to create regression test
}
```

### 4. **Live Code Experimentation**
Try different approaches without restarting:
```javascript
breakinto();  // Edit algorithm in .reload
```

---

## 🐛 Troubleshooting

### "Inspector already open"
**Problem:** Another debugger is already attached.

**Solution:** Close other debuggers or restart your application.

### "Failed to open inspector on port X"
**Problem:** Port is in use.

**Solution:** Breakinto automatically tries random ports. If it persists, check for firewall/permission issues.

### "Cannot read properties of undefined"
**Problem:** Variable might be optimized away by V8.

**Solution:** Use the variable before calling `breakinto()` to prevent optimization:
```javascript
console.log(myVar);  // Force V8 to keep it
breakinto();
```

### Hot-Reload Not Working
**Problem:** `.reload` didn't update the function.

**Limitation:** Hot-reloading has limitations with:
- Module-level code (only function bodies are patched)
- Native modules
- Cached requires

---

## 🤝 Contributing

Contributions are welcome! Here are some ideas:

- [ ] Add breakpoint management (`.break`, `.delete`)
- [ ] Support step-over/step-into debugging
- [ ] Add watch expressions
- [ ] Improve syntax highlighting
- [ ] Add configuration file support
- [ ] Create VS Code extension

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

Inspired by:
- [pry](https://github.com/pry/pry) - Ruby's powerful debugger
- [ipdb](https://github.com/gotcha/ipdb) - Python's interactive debugger
- Chrome DevTools Protocol

Built with:
- [V8 Inspector Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [chalk](https://github.com/chalk/chalk) - Terminal styling
- [cli-highlight](https://github.com/felixfbecker/cli-highlight) - Syntax highlighting
- [ws](https://github.com/websockets/ws) - WebSocket client

---

## 📞 Support

Found a bug? Have a feature request? [Open an issue](https://github.com/yourusername/breakinto/issues)!

---

**Break into your code! 🔍🛑**
