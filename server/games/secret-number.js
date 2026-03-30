function startSecretNumberGame(room, io, roomCode) {
  room.secretNumber = Math.floor(Math.random() * 1001);
  room.minRange = 0;
  room.maxRange = 1000;
  room.currentTurnIndex = 0;
  room.started = true;
  room.history = [];

  io.to(roomCode).emit('game-start', {
    minRange: room.minRange,
    maxRange: room.maxRange,
    currentTurn: room.players[0].name,
    currentTurnIndex: 0,
    players: room.players.map((player) => player.name)
  });

  console.log(`[Game] Room ${roomCode} started. Secret: ${room.secretNumber}`);
}

function handleSecretNumberGuess(room, socket, io, roomCode, { number, isAFK }) {
  if (!room || !room.started || room.gameType !== 'secret-number') return;

  const currentPlayer = room.players[room.currentTurnIndex];
  if (currentPlayer.id !== socket.id) {
    socket.emit('not-your-turn');
    return;
  }

  const guess = parseInt(number, 10);
  if (Number.isNaN(guess) || guess <= room.minRange || guess >= room.maxRange) {
    socket.emit('invalid-guess', {
      message: `So phai nam trong khoang ${room.minRange} - ${room.maxRange}`
    });
    return;
  }

  if (guess === room.secretNumber) {
    io.to(roomCode).emit('game-over', {
      winner: currentPlayer.name,
      secretNumber: room.secretNumber,
      guess
    });
    room.started = false;
    console.log(`[Game] Room ${roomCode}: ${currentPlayer.name} won! Number was ${room.secretNumber}`);
    return;
  }

  const isHigher = guess < room.secretNumber;
  if (isHigher) {
    room.minRange = guess;
  } else {
    room.maxRange = guess;
  }

  if (isAFK) {
    if (!room.penalties) {
      room.penalties = {};
    }
    room.penalties[currentPlayer.id] = (room.penalties[currentPlayer.id] || 0) + 1;
  }

  let nextPlayer;
  while (true) {
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
    nextPlayer = room.players[room.currentTurnIndex];
    if (room.penalties && room.penalties[nextPlayer.id] > 0) {
      room.penalties[nextPlayer.id]--;
      continue;
    }
    break;
  }

  io.to(roomCode).emit('guess-result', {
    playerName: currentPlayer.name,
    guess,
    isHigher,
    minRange: room.minRange,
    maxRange: room.maxRange,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.currentTurnIndex,
    isAFK: isAFK || false
  });
}

function resetSecretNumberGame(room) {
  room.secretNumber = null;
  room.minRange = 0;
  room.maxRange = 1000;
  room.currentTurnIndex = 0;
  room.started = false;
  room.history = [];
}

function endSecretNumberBecauseOpponentLeft(room, io, roomCode) {
  io.to(roomCode).emit('game-over', {
    winner: room.players[0].name,
    secretNumber: room.secretNumber,
    guess: null,
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  endSecretNumberBecauseOpponentLeft,
  handleSecretNumberGuess,
  resetSecretNumberGame,
  startSecretNumberGame
};
