import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import mysql from 'mysql2/promise';

const PORT = Number(process.env.PORT ?? 8765);

const db = mysql.createPool({
  host: process.env.DB_HOST ?? 'mysql',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'arcturus_user',
  password: process.env.DB_PASSWORD ?? 'arcturus_pw',
  database: process.env.DB_NAME ?? 'arcturus',
  connectionLimit: 5
});

const NAME_RE = /^[\p{L}\p{N} _-]{2,24}$/u;

async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function setName(sso, name) {
  if (!sso || !name || !NAME_RE.test(name)) {
    return { ok: false, status: 400, error: 'invalid input' };
  }
  try {
    const [ existing ] = await db.query(
      'SELECT id FROM users WHERE username = ? AND auth_ticket <> ? LIMIT 1',
      [ name, String(sso) ]
    );
    if (existing.length) return { ok: false, status: 409, error: 'name taken' };

    const [ r ] = await db.query(
      'UPDATE users SET username = ? WHERE auth_ticket = ?',
      [ name, String(sso) ]
    );
    if (!r.affectedRows) return { ok: false, status: 404, error: 'sso not found' };

    return { ok: true };
  } catch (e) {
    console.error('[set-name]', e.message);
    return { ok: false, status: 500, error: 'db error' };
  }
}

// roomId -> Map<peerId, ws>
const rooms = new Map();

function joinRoom(roomId, peerId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);

  // If peerId reconnects, drop the old socket
  const prev = room.get(peerId);
  if (prev && prev !== ws) {
    try { prev.close(4000, 'replaced'); } catch {}
  }
  room.set(peerId, ws);

  ws._roomId = roomId;
  ws._peerId = peerId;

  // Tell the joiner who else is already in the room
  const peers = [...room.keys()].filter(id => id !== peerId);
  send(ws, { type: 'peers', peers });

  // Tell everyone else a new peer joined
  broadcast(roomId, peerId, { type: 'peer-joined', peerId });

  console.log(`[+] ${peerId} joined room ${roomId} (size ${room.size})`);
}

function leaveRoom(ws) {
  const { _roomId: roomId, _peerId: peerId } = ws;
  if (!roomId || !peerId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  if (room.get(peerId) === ws) {
    room.delete(peerId);
    broadcast(roomId, peerId, { type: 'peer-left', peerId });
    console.log(`[-] ${peerId} left room ${roomId} (size ${room.size})`);
    if (room.size === 0) rooms.delete(roomId);
  }
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(roomId, fromPeerId, msg) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [peerId, peerWs] of room) {
    if (peerId === fromPeerId) continue;
    send(peerWs, msg);
  }
}

function relay(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room) return;
  const target = room.get(msg.to);
  if (!target) return;
  send(target, { ...msg, from: ws._peerId });
}

const httpServer = createServer(async (req, res) => {
  if (req.url !== '/health') console.log(`[http] ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (req.method === 'POST' && req.url === '/set-name') {
    let body;
    try { body = await readJson(req); }
    catch { res.writeHead(400); res.end('bad json'); return; }
    const { sso, name } = body ?? {};
    console.log(`[set-name] sso=${JSON.stringify(sso)} name=${JSON.stringify(name)}`);
    const result = await setName(sso, name);
    console.log(`[set-name] result`, result);
    res.writeHead(result.ok ? 200 : result.status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*'
    });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  // Expected URL: /?roomId=51&peerId=1
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');
  const peerId = url.searchParams.get('peerId');

  if (!roomId || !peerId) {
    ws.close(4001, 'roomId and peerId required');
    return;
  }

  joinRoom(roomId, peerId, ws);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice':
      case 'mute-state':
      case 'display-name':
        if (msg.to) relay(ws, msg);
        break;
      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`signaling listening on :${PORT}`);
});
