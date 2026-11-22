// Ретранслятор меток ORDEN CLIENT. Игроки мода сами подключаются к нему в фоне.
// Метка летит всем игрокам из той же "комнаты" (адрес Minecraft-сервера), кроме отправителя.
// Запуск: npm install && npm start   (порт берётся из переменной PORT, по умолчанию 8787)
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('ORDEN marks relay: ok\n');
});
const wss = new WebSocketServer({ server, maxPayload: 512 });

const rooms = new Map(); // room -> Set<ws>

function clean(s, max) {
  return String(s).replace(/[|\r\n]/g, '').slice(0, max);
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.nick = null;
  ws.alive = true;
  ws.stamps = [];

  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    ws.alive = true;
    const msg = raw.toString();
    if (msg === 'ping') return;
    const p = msg.split('|');

    if (p[0] === 'join' && p.length >= 3) {
      const room = clean(p[1], 100);
      const nick = clean(p[2], 24);
      if (!room || !nick) return;
      if (ws.room && rooms.has(ws.room)) rooms.get(ws.room).delete(ws);
      ws.room = room;
      ws.nick = nick;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      return;
    }

    if (p[0] === 'mark' && p.length === 8 && ws.room) {
      const now = Date.now();
      ws.stamps = ws.stamps.filter((t) => now - t < 5000);
      if (ws.stamps.length >= 5) return; // не чаще 5 меток за 5 секунд
      ws.stamps.push(now);
      const [x, y, z] = [p[1], p[2], p[3]].map(Number);
      const rgb = parseInt(p[4], 10);
      const snd = parseInt(p[5], 10);
      if (![x, y, z, rgb, snd].every(Number.isFinite)) return;
      const out = `mark|${ws.nick}|${x}|${y}|${z}|${rgb & 0xffffff}|${snd}|${clean(p[7], 64)}`;
      for (const peer of rooms.get(ws.room) || []) {
        if (peer !== ws && peer.readyState === 1) peer.send(out);
      }
    }
  });

  ws.on('close', () => {
    if (ws.room && rooms.has(ws.room)) {
      const set = rooms.get(ws.room);
      set.delete(ws);
      if (set.size === 0) rooms.delete(ws.room);
    }
  });
  ws.on('error', () => {});
});

// Выкидываем «мёртвые» соединения
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 40000);

server.listen(PORT, () => console.log(`ORDEN marks relay слушает порт ${PORT}`));
