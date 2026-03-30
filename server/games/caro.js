function createEmptyBoard() {
  return Array(20).fill(null).map(() => Array(20).fill(null));
}

function startCaroGame(room, io, roomCode) {
  room.board = createEmptyBoard();
  room.currentTurnIndex = 0;
  room.started = true;
  room.history = [];

  io.to(roomCode).emit('caro-start', {
    currentTurn: room.players[0].name,
    currentTurnIndex: 0,
    players: room.players.map((player) => player.name)
  });

  console.log(`[Game] Caro Room ${roomCode} started.`);
}

function hasCaroWin(board, row, col, symbol) {
  const checkDirection = (dx, dy) => {
    let count = 1;
    let offset = 1;

    while (
      row + offset * dy >= 0 &&
      row + offset * dy < 20 &&
      col + offset * dx >= 0 &&
      col + offset * dx < 20 &&
      board[row + offset * dy][col + offset * dx] === symbol
    ) {
      count++;
      offset++;
    }

    offset = 1;
    while (
      row - offset * dy >= 0 &&
      row - offset * dy < 20 &&
      col - offset * dx >= 0 &&
      col - offset * dx < 20 &&
      board[row - offset * dy][col - offset * dx] === symbol
    ) {
      count++;
      offset++;
    }

    return count >= 5;
  };

  return (
    checkDirection(1, 0) ||
    checkDirection(0, 1) ||
    checkDirection(1, 1) ||
    checkDirection(1, -1)
  );
}

function isBoardFull(board) {
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 20; col++) {
      if (board[row][col] === null) {
        return false;
      }
    }
  }

  return true;
}

function handleCaroMove(room, socket, io, roomCode, { row, col }) {
  if (!room || !room.started || room.gameType !== 'caro') return;

  const currentPlayer = room.players[room.currentTurnIndex];
  if (currentPlayer.id !== socket.id) {
    socket.emit('not-your-turn');
    return;
  }

  if (row < 0 || row >= 20 || col < 0 || col >= 20 || room.board[row][col] !== null) {
    socket.emit('invalid-guess', { message: 'O khong hop le! / Invalid cell!' });
    return;
  }

  const symbol = room.currentTurnIndex === 0 ? 'X' : 'O';
  room.board[row][col] = symbol;

  if (hasCaroWin(room.board, row, col, symbol)) {
    io.to(roomCode).emit('caro-over', {
      winner: currentPlayer.name,
      row,
      col,
      symbol
    });
    room.started = false;
    return;
  }

  if (isBoardFull(room.board)) {
    io.to(roomCode).emit('caro-over', {
      winner: 'Hoa / Draw',
      row,
      col,
      symbol,
      isDraw: true
    });
    room.started = false;
    return;
  }

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  const nextPlayer = room.players[room.currentTurnIndex];

  io.to(roomCode).emit('caro-result', {
    playerName: currentPlayer.name,
    row,
    col,
    symbol,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.currentTurnIndex
  });
}

function resetCaroGame(room) {
  room.board = createEmptyBoard();
  room.currentTurnIndex = 0;
  room.started = false;
  room.history = [];
}

function endCaroBecauseOpponentLeft(room, io, roomCode) {
  io.to(roomCode).emit('caro-over', {
    winner: room.players[0].name,
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  createEmptyBoard,
  endCaroBecauseOpponentLeft,
  handleCaroMove,
  resetCaroGame,
  startCaroGame
};
