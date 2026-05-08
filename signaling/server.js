import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = Number(process.env.PORT ?? 8765);

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

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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
