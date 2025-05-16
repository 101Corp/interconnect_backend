const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const PORT = 3000;
const HOST = '0.0.0.0';
const HISTORY_FILE = path.join(__dirname, 'chat_history.json');
const USERS_FILE = path.join(__dirname, 'users.json');

let clients = [];
let messageHistory = [];
let users = {};

// Load saved messages from disk (if any)
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    messageHistory = JSON.parse(raw);
    console.log(`[INFO] Loaded ${messageHistory.length} messages from disk.`);
  } catch (err) {
    console.error('[ERROR] Failed to load chat history:', err);
  }
}

// Load users
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    console.log(`[INFO] Loaded ${Object.keys(users).length} users.`);
  } catch (err) {
    console.error('[ERROR] Failed to load users:', err);
  }
}

function saveHistory() {
  fs.writeFile(HISTORY_FILE, JSON.stringify(messageHistory, null, 2), err => {
    if (err) console.error('[ERROR] Failed to save chat history:', err);
  });
}

function saveUsers() {
  fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), err => {
    if (err) console.error('[ERROR] Failed to save users:', err);
  });
}

function broadcast(data) {
  for (const client of clients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

const sessions = {}; // token -> username

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/auth/signup' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { username, password } = JSON.parse(body);
      console.log(`[SIGNUP] Attempt by user: ${username}`);
      if (!username || !password || users[username]) {
        res.writeHead(400);
        return res.end('Invalid or existing user');
      }
      const hashed = await bcrypt.hash(password, 10);
      users[username] = { password: hashed, color: '#ffffff' };
      saveUsers();
      const token = generateToken();
      sessions[token] = username;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token }));
    });

  } else if (req.url === '/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { username, password } = JSON.parse(body);
      console.log(`[LOGIN] Attempt by user: ${username}`);
      const user = users[username];
      if (!user || !(await bcrypt.compare(password, user.password))) {
        res.writeHead(401);
        return res.end('Invalid credentials');
      }
      const token = generateToken();
      sessions[token] = username;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, color: user.color || '#ffffff' }));
    });

  } else if (req.url === '/auth/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { token } = JSON.parse(body);
      const username = sessions[token];
      console.log(`[VERIFY] Attempt by user: ${username}`);
      if (!username) {
        res.writeHead(401);
        return res.end('Invalid token');
      }
       console.log(`[VERIFY] Passed`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ username, color: users[username].color || '#ffffff' }));
    });

  } else if (req.url === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { text, tempId, username, color } = JSON.parse(body);
      const userColor = users[username]?.color || color || '#ffffff';
      const msgObj = {
        text,
        tempId,
        username: username || 'Anonymous',
        color: userColor,
        timestamp: Date.now()
      };

      console.log(`[MSG] ${msgObj.username} (${msgObj.color}) - ${msgObj.text}`);

      messageHistory.push(msgObj);
      saveHistory();

      setTimeout(() => broadcast(msgObj), 500);

      res.writeHead(200);
      res.end('OK');
    });

  } else if (req.url.startsWith('/delete/') && req.method === 'DELETE') {
    const tsStr = req.url.split('/delete/')[1];
    const timestampToDelete = Number(tsStr);

    if (!timestampToDelete) {
      res.writeHead(400);
      return res.end('Invalid timestamp');
    }

    const idx = messageHistory.findIndex(m => m.timestamp === timestampToDelete);
    if (idx === -1) {
      res.writeHead(404);
      return res.end('Message not found');
    }

    const [deletedMsg] = messageHistory.splice(idx, 1);
    saveHistory();
    console.log(`[DELETE] Message by ${deletedMsg.username} deleted (timestamp: ${timestampToDelete})`);
    broadcast({ delete: true, timestamp: timestampToDelete });

    res.writeHead(200);
    res.end('Deleted');

  } else if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');

    for (const msg of messageHistory) {
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
    }

    clients.push(res);

    req.on('close', () => {
      clients = clients.filter(c => c !== res);
    });

  } else if (req.url === '/auth/set-color' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { token, color } = JSON.parse(body);
      const username = sessions[token];
      //if (!username || !users[username]) {
       // res.writeHead(401);
      //  return res.end('Unauthorized');
     // }
      users[username].color = color;
      saveUsers();
      res.writeHead(200);
      res.end('Color updated');
    });

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`📡 Server live at http://${HOST}:${PORT}`);
});
