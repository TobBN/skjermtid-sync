const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public')); // serverer skjermtid.html

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Sett SYNC_KEY i Render dashboard -> Environment
const SYNC_KEY = process.env.SYNC_KEY || '';
const snapshots = new Map(); // familyId -> { family, state }

io.on('connection', (socket) => {
  let family = null, authed = false;

  socket.on('hello', ({ key, family: fam, clientId }) => {
    if (SYNC_KEY && key !== SYNC_KEY) {
      socket.emit('authError', 'Bad key');
      return socket.disconnect(true);
    }
    authed = true;
    family = String(fam || 'familie');
    socket.join(`family:${family}`);
  });

  socket.on('getSnapshot', ({ family: fam }) => {
    if (!authed) return;
    const f = String(fam || family);
    socket.emit('snapshot', snapshots.get(f) || null);
  });

  socket.on('saveSnapshot', (snap) => {
    if (!authed) return;
    if (!snap || !snap.family) return;
    snapshots.set(String(snap.family), { family: String(snap.family), state: snap.state });
  });

  socket.on('event', (evt) => {
    if (!authed) return;
    if (!evt || !evt.family) return;
    io.to(`family:${String(evt.family)}`).emit('event', evt);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log('listening on ' + PORT));
