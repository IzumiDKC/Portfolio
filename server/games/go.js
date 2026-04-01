const BOARD_SIZE = 9;
const PLAYER_TIME = 180; // 3 minutes per player
const KOMI = 6.5;

// ───────────────────────── Helpers ─────────────────────────

function createEmptyGoBoard() {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

function boardHash(board) {
  return board.map(row => row.map(c => c || '.').join('')).join('|');
}

function cloneBoard(board) {
  return board.map(row => [...row]);
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Flood-fill to find all stones in a connected group and their liberties.
 * Returns { stones: [[r,c],...], liberties: Set<string> }
 */
function getGroup(board, row, col) {
  const color = board[row][col];
  if (!color) return null;
  const stones = [];
  const liberties = new Set();
  const visited = new Set();
  const stack = [[row, col]];

  while (stack.length) {
    const [r, c] = stack.pop();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push([r, c]);

    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const neighbor = board[nr][nc];
      if (neighbor === null) {
        liberties.add(`${nr},${nc}`);
      } else if (neighbor === color && !visited.has(`${nr},${nc}`)) {
        stack.push([nr, nc]);
      }
    }
  }

  return { stones, liberties };
}

/**
 * Remove captured stones from the board.
 * Returns { count, positions: [[r,c],...] }
 */
function removeCaptured(board, color) {
  let count = 0;
  const positions = [];
  const visited = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== color) continue;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      const group = getGroup(board, r, c);
      group.stones.forEach(([sr, sc]) => visited.add(`${sr},${sc}`));
      if (group.liberties.size === 0) {
        group.stones.forEach(([sr, sc]) => {
          board[sr][sc] = null;
          positions.push([sr, sc]);
        });
        count += group.stones.length;
      }
    }
  }

  return { count, positions };
}

// ───────────────────────── Timer ─────────────────────────

function clearGoTimer(room) {
  if (room.goTimerInterval) {
    clearInterval(room.goTimerInterval);
    room.goTimerInterval = null;
  }
  if (room.goAutoPassTimeout) {
    clearTimeout(room.goAutoPassTimeout);
    room.goAutoPassTimeout = null;
  }
}

function startGoTimer(room, io, roomCode) {
  clearGoTimer(room);

  room.goTimerInterval = setInterval(() => {
    const idx = room.goCurrentTurnIndex;
    room.goPlayerTimes[idx]--;
    io.to(roomCode).emit('go-timer-tick', {
      playerTimes: [...room.goPlayerTimes],
      currentTurnIndex: idx
    });

    if (room.goPlayerTimes[idx] <= 0) {
      clearGoTimer(room);
      const currentPlayer = room.players[idx];
      autoPassGo(room, io, roomCode, currentPlayer);
    }
  }, 1000);
}

function autoPassGo(room, io, roomCode, player) {
  if (!room || !room.started) return;

  room.goConsecutivePasses++;
  room.goCurrentTurnIndex = (room.goCurrentTurnIndex + 1) % 2;
  const nextPlayer = room.players[room.goCurrentTurnIndex];

  io.to(roomCode).emit('go-passed', {
    playerName: player.name,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.goCurrentTurnIndex,
    consecutivePasses: room.goConsecutivePasses,
    playerTimes: [...room.goPlayerTimes],
    autoPass: true
  });

  if (room.goConsecutivePasses >= 2) {
    endGoGame(room, io, roomCode);
    return;
  }

  startGoTimer(room, io, roomCode);
}

// ───────────────────────── Game Logic ─────────────────────────

function startGoGame(room, io, roomCode) {
  room.goBoard = createEmptyGoBoard();
  room.goPreviousBoardHash = null;
  room.goCurrentTurnIndex = 0;
  room.goConsecutivePasses = 0;
  room.goCaptures = { black: 0, white: 0 };
  room.goPlayerTimes = [PLAYER_TIME, PLAYER_TIME];
  room.started = true;
  room.history = [];

  io.to(roomCode).emit('go-start', {
    currentTurn: room.players[0].name,
    currentTurnIndex: 0,
    players: room.players.map(p => p.name),
    boardSize: BOARD_SIZE,
    playerTimes: [PLAYER_TIME, PLAYER_TIME]
  });

  console.log(`[Game] Go Room ${roomCode} started.`);
  startGoTimer(room, io, roomCode);
}

function handleGoMove(room, socket, io, roomCode, { row, col }) {
  if (!room || !room.started || room.gameType !== 'go') return;

  const currentPlayer = room.players[room.goCurrentTurnIndex];
  if (currentPlayer.id !== socket.id) {
    socket.emit('not-your-turn');
    return;
  }

  if (!inBounds(row, col) || room.goBoard[row][col] !== null) {
    socket.emit('invalid-guess', { message: 'Ô không hợp lệ! / Invalid cell!' });
    return;
  }

  const color = room.goCurrentTurnIndex === 0 ? 'B' : 'W';
  const opponent = color === 'B' ? 'W' : 'B';

  // Place stone tentatively
  const testBoard = cloneBoard(room.goBoard);
  testBoard[row][col] = color;

  // Capture opponents first
  const captureResult = removeCaptured(testBoard, opponent);
  const captured = captureResult.count;
  const removedStones = captureResult.positions;

  // Check self-capture (suicide) – illegal unless it captures opponent stones
  const ownGroup = getGroup(testBoard, row, col);
  if (ownGroup.liberties.size === 0 && captured === 0) {
    socket.emit('invalid-guess', { message: 'Nước đi tự sát! / Suicide move!' });
    return;
  }

  // Ko rule: check if resulting board == previous board state
  const newHash = boardHash(testBoard);
  if (newHash === room.goPreviousBoardHash) {
    socket.emit('invalid-guess', { message: 'Vi phạm luật Ko! / Ko rule violation!' });
    return;
  }

  // Commit the move
  room.goPreviousBoardHash = boardHash(room.goBoard);
  room.goBoard = testBoard;
  room.goConsecutivePasses = 0;

  if (color === 'B') {
    room.goCaptures.black += captured;
  } else {
    room.goCaptures.white += captured;
  }

  room.goCurrentTurnIndex = (room.goCurrentTurnIndex + 1) % 2;
  const nextPlayer = room.players[room.goCurrentTurnIndex];

  io.to(roomCode).emit('go-result', {
    playerName: currentPlayer.name,
    row,
    col,
    color,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.goCurrentTurnIndex,
    captures: room.goCaptures,
    capturedCount: captured,
    removedStones,
    playerTimes: [...room.goPlayerTimes]
  });

  startGoTimer(room, io, roomCode);
}

function handleGoPass(room, socket, io, roomCode) {
  if (!room || !room.started || room.gameType !== 'go') return;

  const currentPlayer = room.players[room.goCurrentTurnIndex];
  if (currentPlayer.id !== socket.id) {
    socket.emit('not-your-turn');
    return;
  }

  clearGoTimer(room);
  room.goConsecutivePasses++;
  room.goCurrentTurnIndex = (room.goCurrentTurnIndex + 1) % 2;
  const nextPlayer = room.players[room.goCurrentTurnIndex];

  io.to(roomCode).emit('go-passed', {
    playerName: currentPlayer.name,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.goCurrentTurnIndex,
    consecutivePasses: room.goConsecutivePasses,
    playerTimes: [...room.goPlayerTimes]
  });

  if (room.goConsecutivePasses >= 2) {
    endGoGame(room, io, roomCode);
    return;
  }

  startGoTimer(room, io, roomCode);
}

function handleGoResign(room, socket, io, roomCode) {
  if (!room || !room.started || room.gameType !== 'go') return;

  const resigningPlayer = room.players.find(p => p.id === socket.id);
  if (!resigningPlayer) return;

  clearGoTimer(room);
  const winner = room.players.find(p => p.id !== socket.id);

  io.to(roomCode).emit('go-over', {
    winner: winner ? winner.name : 'Unknown',
    loser: resigningPlayer.name,
    reason: 'resign',
    blackScore: 0,
    whiteScore: 0
  });

  room.started = false;
}

function endGoGame(room, io, roomCode) {
  clearGoTimer(room);
  const { blackScore, whiteScore } = calculateGoScore(room.goBoard, room.goCaptures);

  let winner;
  let isDraw = false;
  if (blackScore > whiteScore) {
    winner = room.players[0].name; // Black
  } else if (whiteScore > blackScore) {
    winner = room.players[1].name; // White
  } else {
    isDraw = true;
    winner = null;
  }

  io.to(roomCode).emit('go-over', {
    winner,
    isDraw,
    reason: 'score',
    blackScore: Math.round(blackScore * 10) / 10,
    whiteScore: Math.round(whiteScore * 10) / 10,
    blackPlayer: room.players[0].name,
    whitePlayer: room.players[1].name
  });

  room.started = false;
}

/**
 * Japanese scoring: territory + captures
 * Territory = empty intersections surrounded only by one color's stones.
 */
function calculateGoScore(board, captures) {
  const visited = new Set();
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null || visited.has(`${r},${c}`)) continue;

      // BFS from empty cell to find territory region
      const region = [];
      const borders = new Set();
      const stack = [[r, c]];
      const regionVisited = new Set();

      while (stack.length) {
        const [cr, cc] = stack.pop();
        const key = `${cr},${cc}`;
        if (regionVisited.has(key)) continue;
        regionVisited.add(key);
        visited.add(key);
        region.push([cr, cc]);

        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] === null) {
            if (!regionVisited.has(`${nr},${nc}`)) stack.push([nr, nc]);
          } else {
            borders.add(board[nr][nc]);
          }
        }
      }

      if (borders.size === 1) {
        const owner = [...borders][0];
        if (owner === 'B') blackTerritory += region.length;
        else if (owner === 'W') whiteTerritory += region.length;
      }
    }
  }

  const blackScore = blackTerritory + (captures.black || 0);
  const whiteScore = whiteTerritory + (captures.white || 0) + KOMI;

  return { blackScore, whiteScore };
}

function resetGoGame(room) {
  clearGoTimer(room);
  room.goBoard = createEmptyGoBoard();
  room.goPreviousBoardHash = null;
  room.goCurrentTurnIndex = 0;
  room.goConsecutivePasses = 0;
  room.goCaptures = { black: 0, white: 0 };
  room.goPlayerTimes = [PLAYER_TIME, PLAYER_TIME];
  room.started = false;
  room.history = [];
}

function endGoBecauseOpponentLeft(room, io, roomCode) {
  clearGoTimer(room);
  io.to(roomCode).emit('go-over', {
    winner: room.players[0].name,
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  startGoGame,
  handleGoMove,
  handleGoPass,
  handleGoResign,
  resetGoGame,
  endGoBecauseOpponentLeft
};
