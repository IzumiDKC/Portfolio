const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ── In-memory room storage ──────────────────────
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── Health check endpoint ───────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', rooms: Object.keys(rooms).length });
});

// ── Socket.IO logic ─────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Create Room ─────────────────────────────
  socket.on('create-room', ({ playerName }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }

    rooms[roomCode] = {
      host: socket.id,
      players: [{ id: socket.id, name: playerName || 'Host' }],
      secretNumber: null,
      minRange: 0,
      maxRange: 1000,
      currentTurnIndex: 0,
      started: false,
      history: []
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = playerName;

    socket.emit('room-created', {
      roomCode,
      players: rooms[roomCode].players.map(p => p.name)
    });

    console.log(`[Room] ${playerName} created room ${roomCode}`);
  });

  // ── Join Room ───────────────────────────────
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      socket.emit('join-error', { message: 'Phòng không tồn tại / Room not found' });
      return;
    }
    if (room.started) {
      socket.emit('join-error', { message: 'Game đã bắt đầu / Game already started' });
      return;
    }
    if (room.players.length >= 10) {
      socket.emit('join-error', { message: 'Phòng đã đầy / Room is full' });
      return;
    }

    room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = playerName;

    const playerNames = room.players.map(p => p.name);
    io.to(code).emit('player-joined', { players: playerNames });

    console.log(`[Room] ${playerName} joined room ${code}`);
  });

  // ── Start Game ──────────────────────────────
  socket.on('start-game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    if (socket.id !== room.host) return; // only host can start
    if (room.players.length < 2) {
      socket.emit('start-error', { message: 'Cần ít nhất 2 người chơi / Need at least 2 players' });
      return;
    }

    room.secretNumber = Math.floor(Math.random() * 1001); // 0-1000
    room.minRange = 0;
    room.maxRange = 1000;
    room.currentTurnIndex = 0;
    room.started = true;
    room.history = [];

    io.to(code).emit('game-start', {
      minRange: room.minRange,
      maxRange: room.maxRange,
      currentTurn: room.players[0].name,
      currentTurnIndex: 0,
      players: room.players.map(p => p.name)
    });

    console.log(`[Game] Room ${code} started. Secret: ${room.secretNumber}`);
  });

  // ── Guess ───────────────────────────────────
  socket.on('guess', ({ number, isAFK }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.started) return;

    // Check if it's this player's turn
    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('not-your-turn');
      return;
    }

    const guess = parseInt(number);
    if (isNaN(guess) || guess <= room.minRange || guess >= room.maxRange) {
      socket.emit('invalid-guess', {
        message: `Số phải nằm trong khoảng ${room.minRange} - ${room.maxRange}`
      });
      return;
    }

    // Check win
    if (guess === room.secretNumber) {
      io.to(code).emit('game-over', {
        winner: currentPlayer.name,
        secretNumber: room.secretNumber,
        guess: guess
      });
      room.started = false;
      console.log(`[Game] Room ${code}: ${currentPlayer.name} won! Number was ${room.secretNumber}`);
      return;
    }

    // Update range
    const isHigher = guess < room.secretNumber;
    if (isHigher) {
      room.minRange = guess;
    } else {
      room.maxRange = guess;
    }

    // Handle AFK Penalty
    if (isAFK) {
      if (!room.penalties) room.penalties = {};
      room.penalties[currentPlayer.id] = (room.penalties[currentPlayer.id] || 0) + 1;
    }

    // Advance turn (skip penalized players)
    let nextPlayer;
    while (true) {
      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
      nextPlayer = room.players[room.currentTurnIndex];
      if (room.penalties && room.penalties[nextPlayer.id] > 0) {
        room.penalties[nextPlayer.id]--; // Consume penalty
      } else {
        break; // Ready to play
      }
    }

    const resultPayload = {
      playerName: currentPlayer.name,
      guess: guess,
      isHigher: isHigher, // true = secret is higher than guess
      minRange: room.minRange,
      maxRange: room.maxRange,
      currentTurn: nextPlayer.name,
      currentTurnIndex: room.currentTurnIndex,
      isAFK: isAFK || false
    };

    io.to(code).emit('guess-result', resultPayload);
  });

  // ── Play Again ──────────────────────────────
  socket.on('play-again', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    room.secretNumber = null;
    room.minRange = 0;
    room.maxRange = 1000;
    room.currentTurnIndex = 0;
    room.started = false;
    room.history = [];

    io.to(code).emit('back-to-lobby', {
      players: room.players.map(p => p.name)
    });
  });

  // ── Disconnect ──────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    console.log(`[-] Disconnected: ${socket.id}`);

    if (!code || !rooms[code]) return;

    const room = rooms[code];
    const leavingPlayer = room.players.find(p => p.id === socket.id);
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[code];
      console.log(`[Room] Room ${code} deleted (empty)`);
      return;
    }

    // If host left, assign new host
    if (room.host === socket.id) {
      room.host = room.players[0].id;
    }

    // Fix turn index if needed
    if (room.currentTurnIndex >= room.players.length) {
      room.currentTurnIndex = 0;
    }

    io.to(code).emit('player-left', {
      playerName: leavingPlayer ? leavingPlayer.name : 'Unknown',
      players: room.players.map(p => p.name),
      currentTurn: room.players[room.currentTurnIndex]?.name,
      currentTurnIndex: room.currentTurnIndex,
      newHost: room.players[0].name
    });

    // If game was started and only 1 player remains, end it
    if (room.started && room.players.length < 2) {
      io.to(code).emit('game-over', {
        winner: room.players[0].name,
        secretNumber: room.secretNumber,
        guess: null,
        reason: 'opponent-left'
      });
      room.started = false;
    }
  });
});

// ── Start server ────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 Game server running on port ${PORT}`);
});
