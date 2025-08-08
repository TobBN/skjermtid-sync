const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public')); // serverer public/skjermtid.html

// Rot -> redirect til HTML + enkel healthcheck
app.get('/', (req, res) => res.redirect('/skjermtid.html'));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Server-side "portvakt" via SYNC_KEY (sett i Render -> Environment)
const SYNC_KEY = process.env.SYNC_KEY || '';

// In-memory snapshots (null ved omstart på free-plan — helt ok)
const snapshots = new Map(); // familyId -> { family, state }

io.on('connection', (socket) => {
  let family = null;
  let authed = false;

  socket.on('hello', (msg) => {
    const key = msg && msg.key;
    const fam = msg && msg.family;
    if (SYNC_KEY && key !== SYNC_KEY) {
      socket.emit('authError', 'Bad key');
      return socket.disconnect(true);
    }
    authed = true;
    family = String(fam || 'familie');
    socket.join(`family:${family}`);
  });

  socket.on('getSnapshot', (msg) => {
    if (!authed) return;
    const fam = (msg && msg.family) ? String(msg.family) : family;
    socket.emit('snapshot', snapshots.get(fam) || null);
  });

  socket.on('saveSnapshot', (snap) => {
    if (!authed) return;
    if (!snap || !snap.family) return;
    const fam = String(snap.family);
    snapshots.set(fam, { family: fam, state: snap.state });
  });

  socket.on('event', (evt) => {
    if (!authed) return;
    if (!evt || !evt.family) return;
    // Legg på serversidens tidsstempel for "last write wins"
    evt.serverTs = Date.now();
    io.to(`family:${String(evt.family)}`).emit('event', evt);
  });
});

const PORT = process.env.PORT || 3000; // Ikke hardkod 10000 – Render setter PORT
server.listen(PORT, () => console.log('listening on ' + PORT));
