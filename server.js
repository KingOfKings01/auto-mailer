import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { loadHistory, saveHistory } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Global runner status state
let runState = {
  status: 'idle',
  lastRun: null,
  logs: []
};

// Start a background runner process
function triggerRunner() {
  if (runState.status === 'running') return;

  runState.status = 'running';
  runState.logs = [`[${new Date().toLocaleTimeString()}] Triggered scraping run...\n`];

  const process = spawn('node', ['runner.js'], { cwd: __dirname });

  process.stdout.on('data', (data) => {
    const text = data.toString();
    runState.logs.push(text);
    console.log(text.trim());
  });

  process.stderr.on('data', (data) => {
    const text = data.toString();
    runState.logs.push(`[ERROR] ${text}`);
    console.error(text.trim());
  });

  process.on('close', (code) => {
    runState.lastRun = new Date().toISOString();
    if (code === 0) {
      runState.status = 'idle';
      runState.logs.push(`\n[${new Date().toLocaleTimeString()}] Execution completed successfully.`);
    } else {
      runState.status = 'error';
      runState.logs.push(`\n[${new Date().toLocaleTimeString()}] Execution failed with exit code ${code}.`);
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  // API Endpoints
  if (url.pathname === '/api/history' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const history = loadHistory();
    res.end(JSON.stringify(history.processed_advisories || {}));
    return;
  }

  if (url.pathname === '/api/history/update' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, sent } = JSON.parse(body);
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing advisory ID' }));
          return;
        }

        const history = loadHistory();
        if (history.processed_advisories && history.processed_advisories[id]) {
          history.processed_advisories[id].sent = !!sent;
          history.processed_advisories[id].sentAt = sent ? new Date().toISOString() : null;
          saveHistory(history);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, updated: history.processed_advisories[id] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Advisory not found in history' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/run' && method === 'POST') {
    if (runState.status === 'running') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scraper is already running' }));
      return;
    }
    triggerRunner();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 'started' }));
    return;
  }

  if (url.pathname === '/api/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runState));
    return;
  }

  if (url.pathname === '/api/status/reset' && method === 'POST') {
    if (runState.status !== 'running') {
      runState.status = 'idle';
      runState.logs = [];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runState));
    return;
  }

  // Serve static files
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

  // Simple security check to stay inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.ico': 'image/x-icon'
  };

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Control Panel Server started at http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
