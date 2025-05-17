const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
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

const server = http.createServer(async (req, res) => {
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
        await pool.query('INSERT INTO users (username, password, color, pfp) VALUES ($1, $2, $3, $4)', [username, hashed, '#ffffff', "default_avatar.jpg"]);
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
        const result = await pool.query('SELECT password, color, pfp FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0 || !(await bcrypt.compare(password, result.rows[0].password))) {
          res.writeHead(401);
          return res.end('Invalid credentials');
        }
        const token = generateToken();
        sessions[token] = username;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token, color: result.rows[0].color, pfp: result.rows[0].pfp }));
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
        const result = await pool.query('SELECT color, pfp FROM users WHERE username = $1', [username]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ username, color: result.rows[0].color, pfp: result.rows[0].pfp }));
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/auth/save_settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { token, color, pfp } = JSON.parse(body);
      console.log("1", pfp)
      const username = sessions[token];
      if (!username) {
        res.writeHead(401);
        return res.end('Unauthorized');
      }
      try {
        await pool.query('UPDATE users SET color = $1, pfp = $2 WHERE username = $3', [color, pfp, username]);
        res.writeHead(200);
        res.end('Color updated');
        console.log("2", pfp)
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

  } else if (req.url === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { text, username, color, tempId, pfp, channel, server } = JSON.parse(body);
      const msgObj = {
        text,
        tempId,
        username,
        color,
        channel,
        server,
        timestamp: Date.now(),
        pfp,
      };
      console.log(`[MSG] ${msgObj.username} (${msgObj.color}) - ${msgObj.text}`);
      console.log(channel)
      try {
        await pool.query('INSERT INTO messages (text, username, color, timestamp, pfp, channel, server) VALUES ($1, $2, $3, $4, $5, $6, $7)', [text, username, color, msgObj.timestamp, pfp, channel, server]);
        setTimeout(() => broadcast(msgObj), 500);
        res.writeHead(200);
        res.end('OK');
        console.log("OK",channel)
      } catch (err) {
        res.writeHead(500);
        res.end(err.toString());
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

  } else if (req.url.startsWith('/events')) {
    console.log('hook')
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const channel = urlObj.searchParams.get('channel') || 'general';
    console.log(channel)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');

    try {
      const result = await pool.query(
        'SELECT * FROM messages WHERE channel = $1 ORDER BY timestamp DESC LIMIT 100',
        [channel]
      );
      const messages = result.rows.reverse();
      for (const msg of messages) {
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

  } else if (req.url.startsWith('/server/') && req.method === 'GET') {
    const parts = req.url.split('/');
    const serverName = decodeURIComponent(parts[2]);
    console.log(serverName,"yes")
    if (parts[3] === 'channels') {
      try {
        const result = await pool.query(
          'SELECT name FROM channels WHERE server = $1 ORDER BY name',
          [serverName]
        );
        const channels = result.rows.map(row => row.name);
        console.log(channels)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels }));
      } catch (err) {
        console.error('[ERROR] Fetching channels:', err);
        res.writeHead(500);
        res.end('Internal server error');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } else if (req.url === '/create_channel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { name, server } = JSON.parse(body);
      if (!name || !server) {
        res.writeHead(400);
        return res.end('Missing channel name or server');
      }
      try {
        await pool.query('INSERT INTO channels (name, server) VALUES ($1, $2)', [name, server]);
        res.writeHead(200);
        res.end('Channel created');
      } catch (err) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });
   } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`📡 Server live at http://${HOST}:${PORT}`);
});
