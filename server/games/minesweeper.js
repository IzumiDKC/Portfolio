const BOARD_SIZE = 10;
const MINE_COUNT = 15;

function createMinesweeperBoard() {
  // Each cell: { mine: false, revealed: false, flagged: false, adjacentMines: 0 }
  return Array(BOARD_SIZE).fill(null).map(() =>
    Array(BOARD_SIZE).fill(null).map(() => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacentMines: 0
    }))
  );
}

function placeMines(board, safeRow, safeCol) {
  const safeCells = new Set();
  // Protect a 3x3 area around first click
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr;
      const c = safeCol + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        safeCells.add(`${r},${c}`);
      }
    }
  }

  let placed = 0;
  while (placed < MINE_COUNT) {
    const r = Math.floor(Math.random() * BOARD_SIZE);
    const c = Math.floor(Math.random() * BOARD_SIZE);
    if (!board[r][c].mine && !safeCells.has(`${r},${c}`)) {
      board[r][c].mine = true;
      placed++;
    }
  }

  // Calculate adjacentMines for all cells
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c].mine) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc].mine) {
              count++;
            }
          }
        }
        board[r][c].adjacentMines = count;
      }
    }
  }
}

// Flood-fill reveal: reveal cell and propagate if adjacentMines === 0
function revealCells(board, row, col) {
  const revealed = [];
  const stack = [[row, col]];
  const visited = new Set([`${row},${col}`]);

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealed.push({ row: r, col: c, adjacentMines: cell.adjacentMines });

    if (cell.adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          const key = `${nr},${nc}`;
          if (
            nr >= 0 && nr < BOARD_SIZE &&
            nc >= 0 && nc < BOARD_SIZE &&
            !visited.has(key) &&
            !board[nr][nc].mine &&
            !board[nr][nc].revealed
          ) {
            visited.add(key);
            stack.push([nr, nc]);
          }
        }
      }
    }
  }

  return revealed;
}

function countRevealedSafe(board) {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].revealed && !board[r][c].mine) count++;
    }
  }
  return count;
}

function countFlags(board) {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].flagged) count++;
    }
  }
  return count;
}

// Serialize board for client (hide mine positions for unrevealed/unflagged cells)
function serializeBoardForClient(board, revealAll = false) {
  return board.map(row =>
    row.map(cell => {
      if (revealAll) {
        return {
          mine: cell.mine,
          revealed: cell.revealed,
          flagged: cell.flagged,
          adjacentMines: cell.adjacentMines
        };
      }
      return {
        mine: cell.revealed ? cell.mine : null, // don't expose mine positions
        revealed: cell.revealed,
        flagged: cell.flagged,
        adjacentMines: cell.revealed ? cell.adjacentMines : null
      };
    })
  );
}

function startMinesweeperGame(room, io, roomCode) {
  room.board = createMinesweeperBoard();
  room.currentTurnIndex = 0;
  room.started = true;
  room.history = [];
  room.minesPlaced = false; // mines placed on first reveal
  room.eliminatedPlayers = []; // players who hit mines
  room.alivePlayers = room.players.map(p => ({ ...p })); // copy

  io.to(roomCode).emit('minesweeper-start', {
    board: serializeBoardForClient(room.board),
    currentTurn: room.alivePlayers[0].name,
    currentTurnIndex: 0,
    players: room.players.map(p => p.name),
    alivePlayers: room.alivePlayers.map(p => p.name),
    minesRemaining: MINE_COUNT,
    boardSize: BOARD_SIZE
  });

  console.log(`[Game] Minesweeper Room ${roomCode} started with ${room.players.length} players.`);
}

function getAlivePlayerIndex(room) {
  // Find the current alive player index in the alivePlayers array
  return room.currentTurnIndex % room.alivePlayers.length;
}

function nextAliveTurn(room) {
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.alivePlayers.length;
}

function handleMinesweeperReveal(room, socket, io, roomCode, { row, col }) {
  if (!room || !room.started || room.gameType !== 'minesweeper') return;

  const aliveIdx = getAlivePlayerIndex(room);
  const currentPlayer = room.alivePlayers[aliveIdx];

  if (!currentPlayer || currentPlayer.id !== socket.id) {
    socket.emit('not-your-turn');
    return;
  }

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

  const cell = room.board[row][col];
  if (cell.revealed || cell.flagged) {
    socket.emit('invalid-guess', { message: 'Ô này không hợp lệ!' });
    return;
  }

  // Place mines on first reveal
  if (!room.minesPlaced) {
    placeMines(room.board, row, col);
    room.minesPlaced = true;
  }

  const hitMine = cell.mine;

  if (hitMine) {
    // Reveal the mine
    cell.revealed = true;

    // Eliminate this player
    room.eliminatedPlayers.push({ ...currentPlayer, eliminated: true });
    room.alivePlayers = room.alivePlayers.filter(p => p.id !== currentPlayer.id);

    room.history.push(`💥 ${currentPlayer.name} đã trúng mìn!`);

    // Check game over
    if (room.alivePlayers.length <= 1) {
      // Last player wins
      const winner = room.alivePlayers[0] || null;

      // Reveal all mines
      io.to(roomCode).emit('minesweeper-over', {
        winner: winner ? winner.name : 'Hòa',
        loser: currentPlayer.name,
        board: serializeBoardForClient(room.board, true),
        reason: 'mine',
        history: room.history,
        minesRemaining: MINE_COUNT - countFlags(room.board)
      });
      room.started = false;
      return;
    }

    // Adjust turn index after removing eliminated player
    if (room.currentTurnIndex >= room.alivePlayers.length) {
      room.currentTurnIndex = 0;
    }

    const nextPlayer = room.alivePlayers[room.currentTurnIndex];

    io.to(roomCode).emit('minesweeper-eliminated', {
      eliminatedPlayer: currentPlayer.name,
      row,
      col,
      board: serializeBoardForClient(room.board),
      currentTurn: nextPlayer.name,
      alivePlayers: room.alivePlayers.map(p => p.name),
      eliminatedPlayers: room.eliminatedPlayers.map(p => p.name),
      history: room.history,
      minesRemaining: MINE_COUNT - countFlags(room.board)
    });
    return;
  }

  // Safe reveal
  const revealedCells = revealCells(room.board, row, col);
  const safeRevealed = countRevealedSafe(room.board);
  const totalSafe = BOARD_SIZE * BOARD_SIZE - MINE_COUNT;

  room.history.push(`${currentPlayer.name} đã mở ô (${row + 1}, ${col + 1})`);

  // Check win: all safe cells revealed
  if (safeRevealed >= totalSafe) {
    io.to(roomCode).emit('minesweeper-over', {
      winner: currentPlayer.name,
      board: serializeBoardForClient(room.board, true),
      reason: 'all-clear',
      history: room.history,
      minesRemaining: MINE_COUNT - countFlags(room.board)
    });
    room.started = false;
    return;
  }

  // Next turn
  nextAliveTurn(room);
  const nextPlayer = room.alivePlayers[getAlivePlayerIndex(room)];

  io.to(roomCode).emit('minesweeper-update', {
    revealedCells,
    playerName: currentPlayer.name,
    row,
    col,
    board: serializeBoardForClient(room.board),
    currentTurn: nextPlayer.name,
    alivePlayers: room.alivePlayers.map(p => p.name),
    history: room.history,
    minesRemaining: MINE_COUNT - countFlags(room.board)
  });
}

function handleMinesweeperFlag(room, socket, io, roomCode, { row, col }) {
  if (!room || !room.started || room.gameType !== 'minesweeper') return;

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

  const cell = room.board[row][col];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;

  const aliveIdx = getAlivePlayerIndex(room);
  const currentPlayer = room.alivePlayers[aliveIdx];

  io.to(roomCode).emit('minesweeper-flagged', {
    row,
    col,
    flagged: cell.flagged,
    playerName: socket.playerName,
    minesRemaining: MINE_COUNT - countFlags(room.board),
    currentTurn: currentPlayer ? currentPlayer.name : null
  });
}

function resetMinesweeperGame(room) {
  room.board = createMinesweeperBoard();
  room.currentTurnIndex = 0;
  room.started = false;
  room.history = [];
  room.minesPlaced = false;
  room.eliminatedPlayers = [];
  room.alivePlayers = [];
}

function endMinesweeperBecauseOpponentLeft(room, io, roomCode) {
  const winner = room.alivePlayers && room.alivePlayers.length > 0 ? room.alivePlayers[0] : room.players[0];
  io.to(roomCode).emit('minesweeper-over', {
    winner: winner ? winner.name : 'Unknown',
    board: serializeBoardForClient(room.board, true),
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  createMinesweeperBoard,
  startMinesweeperGame,
  handleMinesweeperReveal,
  handleMinesweeperFlag,
  resetMinesweeperGame,
  endMinesweeperBecauseOpponentLeft
};
