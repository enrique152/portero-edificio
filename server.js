// Portero Virtual — servidor de señalización WebRTC + notificaciones push
// No almacena ni expone ningún número de teléfono: cada unidad se identifica
// solo por su ID (ej "3B"), nunca por un número.

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const UNITS = require('./units.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

// --- VAPID (identidad del servidor para push) ---
// Generados con `npx web-push generate-vapid-keys`. Para producción real,
// generá tu propio par de claves y reemplazalas acá o por variables de entorno.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BCUyXt0R5XAYR9QW5pIvUFLnmzLe8U-AIKvSNKAJOfOp3fsQN6n6fmIGWJhLJgRPxKYnEiTeosyPf87enMlwjiE';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '_Jh-SyNi3_Wk874CPB-Od16yxvIuhAW2_0yYNuLgwvM';
webpush.setVapidDetails('mailto:portero@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// --- Suscripciones push por unidad (persistidas en un JSON simple) ---
function loadSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveSubs(subs) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}
let subscriptions = loadSubs(); // { unitId: pushSubscriptionObject }

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/units', (req, res) => res.json(UNITS));
app.get('/api/vapid-public-key', (req, res) => res.send(VAPID_PUBLIC_KEY));

// El vecino guarda su suscripción push una sola vez desde su página
app.post('/api/subscribe', (req, res) => {
  const { unit, subscription } = req.body;
  if (!unit || !subscription) return res.status(400).end();
  subscriptions[unit] = subscription;
  saveSubs(subscriptions);
  res.status(204).end();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// sockets conectados en este momento, agrupados por unidad
// { unitId: Set<ws> } — puede haber portero(s) y vecino(s) mirando la misma unidad
const rooms = new Map();

// Llamadas "sonando" ahora mismo, por unidad. Así, si el vecino recién
// abre la página (por ejemplo al tocar la notificación push, que tarda
// unos segundos), igual ve que lo están llamando en vez de perderse el
// aviso que ya se mandó antes de que se conectara.
const pendingCalls = new Map(); // unitId -> timeout handle
const RING_TIMEOUT_MS = 90000;

function startPendingCall(unit) {
  clearPendingCall(unit);
  const timeout = setTimeout(() => pendingCalls.delete(unit), RING_TIMEOUT_MS);
  pendingCalls.set(unit, timeout);
}
function clearPendingCall(unit) {
  const existing = pendingCalls.get(unit);
  if (existing) clearTimeout(existing);
  pendingCalls.delete(unit);
}

function joinRoom(unit, ws) {
  if (!rooms.has(unit)) rooms.set(unit, new Set());
  rooms.get(unit).add(ws);
}
function leaveRoom(unit, ws) {
  const room = rooms.get(unit);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(unit);
}
function broadcastToRoom(unit, ws, data) {
  const room = rooms.get(unit);
  if (!room) return;
  for (const client of room) {
    if (client !== ws && client.readyState === client.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}

wss.on('connection', (ws) => {
  ws.unit = null;
  ws.role = null; // 'portero' | 'vecino'

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        ws.unit = msg.unit;
        ws.role = msg.role;
        joinRoom(msg.unit, ws);
        if (msg.role === 'vecino' && pendingCalls.has(msg.unit)) {
          ws.send(JSON.stringify({ type: 'incoming-call', unit: msg.unit }));
        }
        break;
      }

      // El portero pulsa el botón de una unidad: avisamos por WS a quien
      // ya tenga la página abierta, y además disparamos un push para
      // despertar el teléfono del vecino si no la tiene abierta.
      case 'call': {
        startPendingCall(msg.unit);
        broadcastToRoom(msg.unit, ws, { type: 'incoming-call', unit: msg.unit });

        const sub = subscriptions[msg.unit];
        if (sub) {
          const payload = JSON.stringify({
            title: 'Portero eléctrico',
            body: 'Hay alguien en la puerta del edificio',
            unit: msg.unit,
          });
          try {
            await webpush.sendNotification(sub, payload);
          } catch (err) {
            // Suscripción vencida u otro error — no rompe la llamada por WS
            console.error('push error', msg.unit, err.statusCode || err.message);
          }
        }
        break;
      }

      // El vecino avisa que atendió y ya está listo para recibir la oferta
      case 'ready':
        clearPendingCall(msg.unit);
        broadcastToRoom(msg.unit, ws, msg);
        break;

      case 'hangup':
        clearPendingCall(msg.unit);
        broadcastToRoom(msg.unit, ws, msg);
        break;

      // Señalización WebRTC estándar: se reenvía tal cual al otro extremo
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        broadcastToRoom(msg.unit, ws, msg);
        break;
    }
  });

  ws.on('close', () => {
    if (ws.unit) leaveRoom(ws.unit, ws);
  });
});

server.listen(PORT, () => console.log(`Portero virtual escuchando en :${PORT}`));
