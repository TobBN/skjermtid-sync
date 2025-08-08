const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));

// Rot -> redirect + health
app.get('/', (req, res) => res.redirect('/skjermtid.html'));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const SYNC_KEY = process.env.SYNC_KEY || '';
const snapshots = new Map(); // familyId -> { family, state }

io.on('connection', (socket) => {
  let family = null;
  let authed = false;

  socket.on('hello', (msg = {}) => {
    const key = msg.key;
    const fam = msg.family;
    if (SYNC_KEY && key !== SYNC_KEY) {
      socket.emit('authError', 'Bad key');
      return socket.disconnect(true);
    }
    authed = true;
    family = String(fam || 'familie');
    socket.join(`family:${family}`);
    socket.emit('authed', { ok: true });
  });

  socket.on('getSnapshot', (msg = {}) => {
    if (!authed) return;
    const fam = msg.family ? String(msg.family) : family;
    socket.emit('snapshot', snapshots.get(fam) || null);
  });

  socket.on('saveSnapshot', (snap = {}) => {
    if (!authed) return;
    if (!snap.family) return;
    const fam = String(snap.family);
    // enkel sanity: krever alltid children-array
    if (!snap.state || !Array.isArray(snap.state.children) || snap.state.children.length === 0) return;
    snapshots.set(fam, { family: fam, state: snap.state });
  });

  socket.on('event', (evt = {}) => {
    if (!authed) return;
    if (!evt.family) return;
    evt.serverTs = Date.now(); // last-write-wins klokke
    io.to(`family:${String(evt.family)}`).emit('event', evt);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('listening on ' + PORT));
