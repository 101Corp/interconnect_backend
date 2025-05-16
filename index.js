const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');


const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const pool = new Pool({
  connectionString: postgresql://interconnected:RCq7ZzfWswAm7Xsf6mzyNv0geRgs13yc@dpg-d0jsvbbe5dus73b93100-a/interconnected,
  ssl: true ? { rejectUnauthorized: false } : false,
});

const sessions = {}; // token -> username
let clients = [];

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function broadcast(data) {
  for (const client of clients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

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
      if (!username || !password) {
        res.writeHead(400);
        return res.end('Invalid user input');
      }
      try {
        const userCheck = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
          res.writeHead(400);
          return res.end('User already exists');
        }
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password, color) VALUES ($1, $2, $3)', [username, hashed, '#ffffff']);
        const token = generateToken();
        sessions[token] = username;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token }));
      } catch (err) {
        console.error('[ERROR] Signup failed:', err);
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { username, password } = JSON.parse(body);
      console.log(`[LOGIN] Attempt by user: ${username}`);
      try {
        const result = await pool.query('SELECT password, color FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0 || !(await bcrypt.compare(password, result.rows[0].password))) {
          res.writeHead(401);
          return res.end('Invalid credentials');
        }
        const token = generateToken();
        sessions[token] = username;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token, color: result.rows[0].color }));
      } catch (err) {
        console.error('[ERROR] Login failed:', err);
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/auth/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { token } = JSON.parse(body);
      const username = sessions[token];
      if (!username) {
        res.writeHead(401);
        return res.end('Invalid token');
      }
      try {
        const result = await pool.query('SELECT color FROM users WHERE username = $1', [username]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ username, color: result.rows[0].color }));
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/auth/set-color' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { token, color } = JSON.parse(body);
      const username = sessions[token];
      if (!username) {
        res.writeHead(401);
        return res.end('Unauthorized');
      }
      try {
        await pool.query('UPDATE users SET color = $1 WHERE username = $2', [color, username]);
        res.writeHead(200);
        res.end('Color updated');
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { text, tempId, username, color } = JSON.parse(body);
      const msgObj = {
        text,
        tempId,
        username,
        color,
        timestamp: Date.now(),
      };
      console.log(`[MSG] ${msgObj.username} (${msgObj.color}) - ${msgObj.text}`);
      try {
        await pool.query('INSERT INTO messages (text, username, color, timestamp) VALUES ($1, $2, $3, $4)', [text, username, color, msgObj.timestamp]);
        setTimeout(() => broadcast(msgObj), 500);
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url.startsWith('/delete/') && req.method === 'DELETE') {
    const tsStr = req.url.split('/delete/')[1];
    const timestampToDelete = Number(tsStr);
    if (!timestampToDelete) {
      res.writeHead(400);
      return res.end('Invalid timestamp');
    }
    try {
      await pool.query('DELETE FROM messages WHERE timestamp = $1', [timestampToDelete]);
      console.log(`[DELETE] Message deleted (timestamp: ${timestampToDelete})`);
      broadcast({ delete: true, timestamp: timestampToDelete });
      res.writeHead(200);
      res.end('Deleted');
    } catch (err) {
      res.writeHead(500);
      res.end('Internal server error');
    }

  } else if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');

    try {
      const result = await pool.query('SELECT * FROM messages ORDER BY timestamp ASC');
      for (const msg of result.rows) {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
      clients.push(res);
      req.on('close', () => {
        clients = clients.filter(c => c !== res);
      });
    } catch (err) {
      res.writeHead(500);
      res.end('Internal server error');
    }

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`📡 Server live at http://${HOST}:${PORT}`);
});
