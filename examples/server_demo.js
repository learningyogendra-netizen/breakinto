
import http from 'node:http';
import breakinto from '../src/index.js';

const server = http.createServer(async (req, res) => {
    console.log(`Received request: ${req.url}`);

    if (req.url === '/stop') {
        console.log('Pausing in controller...');
        // Pause here!
        await breakinto();
        console.log('Resumed! Sending response...');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Request completed after breakinto!');
    } else {
        res.writeHead(200);
        res.end('Hello World');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Try: curl http://localhost:${PORT}/stop`);
});
