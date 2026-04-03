// ─────────────────────────────────────────────
//  Cờ Tướng (Xiangqi) – Server Game Logic
// ─────────────────────────────────────────────

const ROWS = 10;
const COLS = 9;
const PLAYER_TIME = 300; // 5 minutes each

// ── Board Setup ──────────────────────────────
function createInitialBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  // Black pieces (top, rows 0-9 from black's perspective, rows 0 = top)
  const back = ['R','N','E','A','K','A','E','N','R'];
  back.forEach((t, c) => { b[0][c] = { type: t, color: 'b' }; });
  b[2][1] = { type: 'C', color: 'b' };
  b[2][7] = { type: 'C', color: 'b' };
  for (let c = 0; c < 9; c += 2) b[3][c] = { type: 'P', color: 'b' };

  // Red pieces (bottom)
  const backR = ['R','N','E','A','K','A','E','N','R'];
  backR.forEach((t, c) => { b[9][c] = { type: t, color: 'r' }; });
  b[7][1] = { type: 'C', color: 'r' };
  b[7][7] = { type: 'C', color: 'r' };
  for (let c = 0; c < 9; c += 2) b[6][c] = { type: 'P', color: 'r' };

  return b;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

// ── Move Generation ──────────────────────────
function getValidMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const moves = [];

  switch (piece.type) {
    case 'K': getKingMoves(board, row, col, piece.color, moves); break;
    case 'A': getAdvisorMoves(board, row, col, piece.color, moves); break;
    case 'E': getElephantMoves(board, row, col, piece.color, moves); break;
    case 'R': getRookMoves(board, row, col, piece.color, moves); break;
    case 'C': getCannonMoves(board, row, col, piece.color, moves); break;
    case 'N': getKnightMoves(board, row, col, piece.color, moves); break;
    case 'P': getPawnMoves(board, row, col, piece.color, moves); break;
  }

  // Filter moves that leave own king in check
  return moves.filter(([tr, tc]) => {
    const nb = cloneBoard(board);
    nb[tr][tc] = nb[row][col];
    nb[row][col] = null;
    return !isInCheck(nb, piece.color);
  });
}

function canPlace(board, tr, tc, color) {
  if (!inBounds(tr, tc)) return false;
  const t = board[tr][tc];
  return !t || t.color !== color;
}

function getKingMoves(board, row, col, color, moves) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
    if (canPlace(board, nr, nc, color)) moves.push([nr, nc]);
  }
  // Flying general: kings face each other with no pieces between
}

function getAdvisorMoves(board, row, col, color, moves) {
  const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
    if (canPlace(board, nr, nc, color)) moves.push([nr, nc]);
  }
}

function getElephantMoves(board, row, col, color, moves) {
  const dirs = [[-2,-2],[-2,2],[2,-2],[2,2]];
  const blocked = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const rMin = color === 'r' ? 5 : 0;
  const rMax = color === 'r' ? 9 : 4;
  for (let i = 0; i < 4; i++) {
    const [dr, dc] = dirs[i];
    const nr = row + dr, nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    if (nr < rMin || nr > rMax) continue; // can't cross river
    // Check blocking foot
    const mr = row + blocked[i][0], mc = col + blocked[i][1];
    if (board[mr][mc]) continue; // foot blocked
    if (canPlace(board, nr, nc, color)) moves.push([nr, nc]);
  }
}

function getRookMoves(board, row, col, color, moves) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of dirs) {
    let nr = row + dr, nc = col + dc;
    while (inBounds(nr, nc)) {
      if (board[nr][nc]) {
        if (board[nr][nc].color !== color) moves.push([nr, nc]);
        break;
      }
      moves.push([nr, nc]);
      nr += dr; nc += dc;
    }
  }
}

function getCannonMoves(board, row, col, color, moves) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of dirs) {
    let nr = row + dr, nc = col + dc;
    let jumped = false;
    while (inBounds(nr, nc)) {
      if (!jumped) {
        if (board[nr][nc]) { jumped = true; }
        else moves.push([nr, nc]);
      } else {
        if (board[nr][nc]) {
          if (board[nr][nc].color !== color) moves.push([nr, nc]);
          break;
        }
      }
      nr += dr; nc += dc;
    }
  }
}

function getKnightMoves(board, row, col, color, moves) {
  // (leg, diagonal) pairs
  const steps = [
    [[-1, 0],[-2,-1]], [[-1, 0],[-2,1]],
    [[1,  0],[2, -1]], [[1,  0],[2,  1]],
    [[0, -1],[-1,-2]], [[0, -1],[1, -2]],
    [[0,  1],[-1, 2]], [[0,  1],[1,  2]]
  ];
  for (const [[lr, lc],[dr, dc]] of steps) {
    const mr = row + lr, mc = col + lc;
    if (!inBounds(mr, mc) || board[mr][mc]) continue; // hobbled
    const nr = row + dr, nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    if (canPlace(board, nr, nc, color)) moves.push([nr, nc]);
  }
}

function getPawnMoves(board, row, col, color, moves) {
  const forward = color === 'r' ? -1 : 1;
  const crossedRiver = color === 'r' ? row <= 4 : row >= 5;

  // Always can move forward
  const nr = row + forward;
  if (inBounds(nr, col) && canPlace(board, nr, col, color)) moves.push([nr, col]);

  // Sideways only after crossing river
  if (crossedRiver) {
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (inBounds(row, nc) && canPlace(board, row, nc, color)) moves.push([row, nc]);
    }
  }
}

// ── Check Detection ──────────────────────────
function findKing(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell && cell.type === 'K' && cell.color === color) return [r, c];
    }
  }
  return null;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return true;
  const [kr, kc] = king;
  const opp = color === 'r' ? 'b' : 'r';

  // Check if any opponent piece attacks the king
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== opp) continue;

      // Get raw moves (without check-filter to avoid recursion)
      const raw = [];
      switch (piece.type) {
        case 'K': getKingMoves(board, r, c, opp, raw); break;
        case 'A': getAdvisorMoves(board, r, c, opp, raw); break;
        case 'E': getElephantMoves(board, r, c, opp, raw); break;
        case 'R': getRookMoves(board, r, c, opp, raw); break;
        case 'C': getCannonMoves(board, r, c, opp, raw); break;
        case 'N': getKnightMoves(board, r, c, opp, raw); break;
        case 'P': getPawnMoves(board, r, c, opp, raw); break;
      }
      if (raw.some(([mr, mc]) => mr === kr && mc === kc)) return true;
    }
  }

  // Flying general rule
  const [bKr, bKc] = findKing(board, opp) || [-1, -1];
  if (bKc === kc) {
    const minR = Math.min(kr, bKr) + 1;
    const maxR = Math.max(kr, bKr);
    let clear = true;
    for (let r = minR; r < maxR; r++) {
      if (board[r][kc]) { clear = false; break; }
    }
    if (clear && bKr !== -1) return true;
  }

  return false;
}

function isCheckmate(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      if (getValidMoves(board, r, c).length > 0) return false;
    }
  }
  return true;
}

// ── Timer ────────────────────────────────────
function clearCoTuongTimer(room) {
  if (room.ctTimer) { clearInterval(room.ctTimer); room.ctTimer = null; }
}

function startCoTuongTimer(room, io, roomCode) {
  clearCoTuongTimer(room);
  room.ctTimer = setInterval(() => {
    if (!room.started) { clearCoTuongTimer(room); return; }
    const idx = room.ctCurrentTurnIndex;
    room.ctTimes[idx]--;
    if (room.ctTimes[idx] < 0) room.ctTimes[idx] = 0;
    io.to(roomCode).emit('co-tuong-timer-tick', { times: [...room.ctTimes], idx });
    if (room.ctTimes[idx] <= 0) {
      clearCoTuongTimer(room);
      const winner = room.players[1 - idx];
      const loser = room.players[idx];
      io.to(roomCode).emit('co-tuong-over', { winner: winner.name, loser: loser.name, reason: 'timeout' });
      room.started = false;
    }
  }, 1000);
}

// ── Public API ───────────────────────────────
function startCoTuongGame(room, io, roomCode) {
  room.ctBoard = createInitialBoard();
  room.ctCurrentTurnIndex = 0; // red goes first
  room.ctTimes = [PLAYER_TIME, PLAYER_TIME];
  room.started = true;
  room.history = [];

  io.to(roomCode).emit('co-tuong-start', {
    board: room.ctBoard,
    players: room.players.map(p => p.name),
    currentTurn: room.players[0].name,
    currentTurnIndex: 0,
    times: room.ctTimes
  });

  console.log(`[Game] Cờ Tướng Room ${roomCode} started.`);
  startCoTuongTimer(room, io, roomCode);
}

function handleCoTuongMove(room, socket, io, roomCode, { fromRow, fromCol, toRow, toCol }) {
  if (!room || !room.started || room.gameType !== 'co-tuong') return;

  const currentPlayer = room.players[room.ctCurrentTurnIndex];
  if (currentPlayer.id !== socket.id) { socket.emit('not-your-turn'); return; }

  const piece = room.ctBoard[fromRow]?.[fromCol];
  if (!piece) { socket.emit('invalid-guess', { message: 'Không có quân!' }); return; }

  // Validate color: player 0 = red, player 1 = black
  const expectedColor = room.ctCurrentTurnIndex === 0 ? 'r' : 'b';
  if (piece.color !== expectedColor) { socket.emit('invalid-guess', { message: 'Không phải quân của bạn!' }); return; }

  const valids = getValidMoves(room.ctBoard, fromRow, fromCol);
  if (!valids.some(([r, c]) => r === toRow && c === toCol)) {
    socket.emit('invalid-guess', { message: 'Nước đi không hợp lệ!' });
    return;
  }

  const captured = room.ctBoard[toRow][toCol];
  room.ctBoard[toRow][toCol] = piece;
  room.ctBoard[fromRow][fromCol] = null;

  room.ctCurrentTurnIndex = 1 - room.ctCurrentTurnIndex;
  const nextPlayer = room.players[room.ctCurrentTurnIndex];
  const nextColor = room.ctCurrentTurnIndex === 0 ? 'r' : 'b';

  const inChk = isInCheck(room.ctBoard, nextColor);
  const isMate = inChk && isCheckmate(room.ctBoard, nextColor);
  const isStaleMate = !inChk && isCheckmate(room.ctBoard, nextColor); // stalemate rare in xiangqi

  io.to(roomCode).emit('co-tuong-result', {
    fromRow, fromCol, toRow, toCol,
    piece,
    captured: captured || null,
    currentTurn: nextPlayer.name,
    currentTurnIndex: room.ctCurrentTurnIndex,
    board: room.ctBoard,
    times: [...room.ctTimes],
    inCheck: inChk
  });

  if (isMate || isStaleMate) {
    clearCoTuongTimer(room);
    io.to(roomCode).emit('co-tuong-over', {
      winner: currentPlayer.name,
      loser: nextPlayer.name,
      reason: isMate ? 'checkmate' : 'stalemate'
    });
    room.started = false;
    return;
  }

  startCoTuongTimer(room, io, roomCode);
}

function resetCoTuongGame(room) {
  clearCoTuongTimer(room);
  room.ctBoard = createInitialBoard();
  room.ctCurrentTurnIndex = 0;
  room.ctTimes = [PLAYER_TIME, PLAYER_TIME];
  room.started = false;
  room.history = [];
}

function endCoTuongBecauseOpponentLeft(room, io, roomCode) {
  clearCoTuongTimer(room);
  io.to(roomCode).emit('co-tuong-over', {
    winner: room.players[0].name,
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  startCoTuongGame,
  handleCoTuongMove,
  resetCoTuongGame,
  endCoTuongBecauseOpponentLeft
};
