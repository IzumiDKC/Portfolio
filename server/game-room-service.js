const {
  createEmptyBoard,
  endCaroBecauseOpponentLeft,
  handleCaroMove,
  resetCaroGame,
  startCaroGame
} = require('./games/caro');
const {
  endSecretNumberBecauseOpponentLeft,
  handleSecretNumberGuess,
  resetSecretNumberGame,
  startSecretNumberGame
} = require('./games/secret-number');
const {
  startMemoryGame,
  handleMemoryFlip,
  resetMemoryGame,
  endMemoryBecauseOpponentLeft,
  handleMemoryUseHint
} = require('./games/memory');
const {
  startTienLenGame,
  handleTienLenMove,
  handleTienLenPass,
  endTienLenBecauseOpponentLeft,
  resetTienLenGame
} = require('./games/tien-len');
const {
  createMinesweeperBoard,
  startMinesweeperGame,
  handleMinesweeperReveal,
  handleMinesweeperFlag,
  resetMinesweeperGame,
  endMinesweeperBecauseOpponentLeft
} = require('./games/minesweeper');

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

function getRoomCount() {
  return Object.keys(rooms).length;
}

function registerGameHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on('create-room', ({ playerName, gameType }) => {
      let roomCode = generateRoomCode();
      while (rooms[roomCode]) {
        roomCode = generateRoomCode();
      }

      rooms[roomCode] = {
        gameType: gameType || 'secret-number',
        host: socket.id,
        players: [{ id: socket.id, name: playerName || 'Host' }],
        secretNumber: null,
        minRange: 0,
        maxRange: 1000,
        board: gameType === 'minesweeper' ? createMinesweeperBoard() : createEmptyBoard(),
        currentTurnIndex: 0,
        started: false,
        history: [],
        minesPlaced: false,
        eliminatedPlayers: [],
        alivePlayers: []
      };

      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerName = playerName;

      socket.emit('room-created', {
        roomCode,
        players: rooms[roomCode].players.map((player) => player.name)
      });

      console.log(`[Room] ${playerName} created room ${roomCode}`);
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
      const code = roomCode.toUpperCase().trim();
      const room = rooms[code];

      if (!room) {
        socket.emit('join-error', { message: 'Phong khong ton tai / Room not found' });
        return;
      }

      if (room.started) {
        socket.emit('join-error', { message: 'Game da bat dau / Game already started' });
        return;
      }

      if (room.players.length >= 10) {
        socket.emit('join-error', { message: 'Phong da day / Room is full' });
        return;
      }

      room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
      socket.join(code);
      socket.roomCode = code;
      socket.playerName = playerName;

      io.to(code).emit('player-joined', {
        players: room.players.map((player) => player.name)
      });

      console.log(`[Room] ${playerName} joined room ${code}`);
    });

    socket.on('start-game', () => {
      const code = socket.roomCode;
      const room = rooms[code];

      console.log(`[Debug start-game] code: ${code}, myId: ${socket.id}, room_host: ${room?.host}`);

      if (!room) return;
      if (socket.id !== room.host) {
        console.log(`[Debug start-game] failed: Im not host!`);
        return;
      }

      if (room.players.length < 2) {
        console.log(`[Debug start-game] failed: Not enough players`);
        socket.emit('start-error', { message: 'Can it nhat 2 nguoi choi / Need at least 2 players' });
        return;
      }

      console.log(`[Debug start-game] gameType is ${room.gameType}`);

      if (room.gameType === 'caro') {
        startCaroGame(room, io, code);
        return;
      }
      if (room.gameType === 'memory') {
        startMemoryGame(room, io, code);
        return;
      }
      if (room.gameType === 'tien-len') {
        startTienLenGame(room, io, code);
        return;
      }
      if (room.gameType === 'minesweeper') {
        startMinesweeperGame(room, io, code);
        return;
      }

      startSecretNumberGame(room, io, code);
    });

    socket.on('guess', ({ number, isAFK }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleSecretNumberGuess(room, socket, io, code, { number, isAFK });
    });

    socket.on('caro-move', ({ row, col }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleCaroMove(room, socket, io, code, { row, col });
    });

    socket.on('memory-flip', ({ cardIndex }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleMemoryFlip(room, socket, io, code, { cardIndex });
    });

    socket.on('memory-use-hint', () => {
      const code = socket.roomCode;
      const room = rooms[code];
      if (room) handleMemoryUseHint(room, socket, io, code);
    });

    socket.on('tien-len-move', ({ cards }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleTienLenMove(room, socket, io, code, { cards });
    });

    socket.on('tien-len-pass', () => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleTienLenPass(room, socket, io, code);
    });

    socket.on('minesweeper-reveal', ({ row, col }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleMinesweeperReveal(room, socket, io, code, { row, col });
    });

    socket.on('minesweeper-flag', ({ row, col }) => {
      const code = socket.roomCode;
      const room = rooms[code];
      handleMinesweeperFlag(room, socket, io, code, { row, col });
    });

    socket.on('play-again', () => {
      const code = socket.roomCode;
      const room = rooms[code];

      if (!room || socket.id !== room.host) return;

      resetSecretNumberGame(room);
      resetCaroGame(room);
      resetMemoryGame(room);
      resetTienLenGame(room);
      resetMinesweeperGame(room);

      io.to(code).emit('back-to-lobby', {
        players: room.players.map((player) => player.name)
      });
    });

    socket.on('disconnect', () => {
      const code = socket.roomCode;
      console.log(`[-] Disconnected: ${socket.id}`);

      if (!code || !rooms[code]) return;

      const room = rooms[code];
      const leavingPlayer = room.players.find((player) => player.id === socket.id);
      room.players = room.players.filter((player) => player.id !== socket.id);

      if (room.players.length === 0) {
        delete rooms[code];
        console.log(`[Room] Room ${code} deleted (empty)`);
        return;
      }

      if (room.host === socket.id) {
        room.host = room.players[0].id;
      }

      if (room.currentTurnIndex >= room.players.length) {
        room.currentTurnIndex = 0;
      }

      io.to(code).emit('player-left', {
        playerName: leavingPlayer ? leavingPlayer.name : 'Unknown',
        players: room.players.map((player) => player.name),
        currentTurn: room.players[room.currentTurnIndex]?.name,
        currentTurnIndex: room.currentTurnIndex,
        newHost: room.players[0].name
      });

      if (room.started && room.players.length < 2) {
        if (room.gameType === 'caro') {
          endCaroBecauseOpponentLeft(room, io, code);
        } else if (room.gameType === 'memory') {
          endMemoryBecauseOpponentLeft(room, io, code);
        } else if (room.gameType === 'tien-len') {
          endTienLenBecauseOpponentLeft(room, io, code);
        } else if (room.gameType === 'minesweeper') {
          endMinesweeperBecauseOpponentLeft(room, io, code);
        } else {
          endSecretNumberBecauseOpponentLeft(room, io, code);
        }
      }
    });
  });
}

module.exports = {
  getRoomCount,
  registerGameHandlers
};
