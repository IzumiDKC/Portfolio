import { ROWS, COLS, PIECE_LABELS } from './constants.js';

const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

// ── Shared move logic (mirrors server, client-side for validation) ──
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

function canPlace(b, r, c, color) {
  if (!inBounds(r, c)) return false;
  const t = b[r][c];
  return !t || t.color !== color;
}

function getRawMoves(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  const moves = [];
  const { type, color } = piece;

  if (type === 'K') {
    const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'A') {
    const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'E') {
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    const blocked = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const rMin = color === 'r' ? 5 : 0;
    const rMax = color === 'r' ? 9 : 4;
    for (let i = 0; i < 4; i++) {
      const nr = row + dirs[i][0], nc = col + dirs[i][1];
      if (!inBounds(nr, nc) || nr < rMin || nr > rMax) continue;
      if (b[row + blocked[i][0]][col + blocked[i][1]]) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; }
        moves.push([nr, nc]);
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = row + dr, nc = col + dc, jumped = false;
      while (inBounds(nr, nc)) {
        if (!jumped) { if (b[nr][nc]) jumped = true; else moves.push([nr, nc]); }
        else { if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; } }
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'N') {
    const steps = [
      [[-1, 0], [-2, -1]], [[-1, 0], [-2, 1]], [[1, 0], [2, -1]], [[1, 0], [2, 1]],
      [[0, -1], [-1, -2]], [[0, -1], [1, -2]], [[0, 1], [-1, 2]], [[0, 1], [1, 2]]
    ];
    for (const [[lr, lc], [dr, dc]] of steps) {
      const mr = row + lr, mc = col + lc;
      if (!inBounds(mr, mc) || b[mr][mc]) continue;
      const nr = row + dr, nc = col + dc;
      if (inBounds(nr, nc) && canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'P') {
    const fwd = color === 'r' ? -1 : 1;
    const crossed = color === 'r' ? row <= 4 : row >= 5;
    if (inBounds(row + fwd, col) && canPlace(b, row + fwd, col, color)) moves.push([row + fwd, col]);
    if (crossed) {
      for (const dc of [-1, 1])
        if (inBounds(row, col + dc) && canPlace(b, row, col + dc, color)) moves.push([row, col + dc]);
    }
  }
  return moves;
}

function findKing(b, color) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c]?.type === 'K' && b[r][c]?.color === color) return [r, c];
  return null;
}

function isInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return true;
  const [kr, kc] = king;
  const opponent = color === 'r' ? 'b' : 'r';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c]?.color === opponent && getRawMoves(b, r, c).some(([mr, mc]) => mr === kr && mc === kc)) return true;
  const ok = findKing(b, opponent);
  if (ok && ok[1] === kc) {
    const minR = Math.min(kr, ok[0]) + 1, maxR = Math.max(kr, ok[0]);
    if ([...Array(maxR - minR)].every((_, i) => !b[minR + i][kc])) return true;
  }
  return false;
}

function getValidMovesClient(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  return getRawMoves(b, row, col).filter(([tr, tc]) => {
    const nb = b.map(r => r.map(c => c ? { ...c } : null));
    nb[tr][tc] = nb[row][col];
    nb[row][col] = null;
    return !isInCheck(nb, piece.color);
  });
}

function isCheckmate(b, color) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c]?.color === color && getValidMovesClient(b, r, c).length > 0) return false;
  return true;
}

// ── AI Game Controller ──────────────────────────────────────────
export function createCoTuongAiGame({ state, elements, ui }) {
  let worker = null;
  let aiThinking = false;

  function getWorker() {
    if (!worker) {
      worker = new Worker(WORKER_URL);
      worker.onmessage = handleWorkerMessage;
      worker.onerror = e => console.error('[CT AI Worker]', e);
    }
    return worker;
  }

  function startGame(difficulty, playerSide = 'r') {
    if (worker) { worker.terminate(); worker = null; }

    // Reset state
    state.isGameOver = false;
    state.isAiMode = true;
    state.aiDifficulty = difficulty;
    state.myColor = playerSide;
    const aiColor = playerSide === 'r' ? 'b' : 'r';

    state.currentTurnColor = 'r';  // Red goes first
    state.isPlayerTurn = (playerSide === 'r');
    state.selectedPiece = null;
    state.validMoves = [];
    state.lastMove = null;
    state.playerTimes = [300, 300];

    // Build initial board
    state.board = createInitialBoard();

    const isEn = ui.getLang() === 'en';
    if (elements.redNameEl) {
      elements.redNameEl.textContent = playerSide === 'r' ? (isEn ? 'You (Red)' : 'Bạn (Đỏ)') : `AI (${diffLabel(difficulty)}) - Đỏ`;
    }
    if (elements.blackNameEl) {
      elements.blackNameEl.textContent = playerSide === 'b' ? (isEn ? 'You (Black)' : 'Bạn (Đen)') : `AI (${diffLabel(difficulty)}) - Đen`;
    }
    if (elements.roomBadge) elements.roomBadge.style.display = 'none';
    if (elements.historyLog) elements.historyLog.innerHTML = '';

    ui.initBoardState(state.board);
    ui.buildBoard(handleCellClick);
    ui.setupDefs();
    ui.updateTurnUI({ isAI: true, color: 'r' });
    ui.updatePlayerTimes(state.playerTimes, 0);
    ui.showScreen(elements.playScreen);
    
    if (playerSide === 'r') {
      ui.startAiTimer(0); // player's timer starts
    } else {
      ui.updateTurnUI({ isAI: true, color: 'r' });
      aiThinking = true;
      setTimeout(triggerAiMove, 500);
    }
  }

  function diffLabel(d) {
    const labels = { easy: 'Dễ / Easy', medium: 'TB / Medium', hard: 'Khó / Hard' };
    return labels[d] || d;
  }

  function createInitialBoard() {
    const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const back = ['R', 'N', 'E', 'A', 'K', 'A', 'E', 'N', 'R'];
    back.forEach((t, c) => { b[0][c] = { type: t, color: 'b' }; });
    b[2][1] = { type: 'C', color: 'b' }; b[2][7] = { type: 'C', color: 'b' };
    for (let c = 0; c < 9; c += 2) b[3][c] = { type: 'P', color: 'b' };
    back.forEach((t, c) => { b[9][c] = { type: t, color: 'r' }; });
    b[7][1] = { type: 'C', color: 'r' }; b[7][7] = { type: 'C', color: 'r' };
    for (let c = 0; c < 9; c += 2) b[6][c] = { type: 'P', color: 'r' };
    return b;
  }

  // ── Player click ─────────────────────────────────────────────
  function handleCellClick(row, col) {
    if (state.isGameOver || !state.isPlayerTurn || aiThinking) return;

    const clickedPiece = state.board[row][col];
    const sel = state.selectedPiece;

    // If own piece clicked – select/re-select
    if (clickedPiece && clickedPiece.color === state.myColor) {
      if (sel && sel.row === row && sel.col === col) {
        // Deselect
        state.selectedPiece = null;
        state.validMoves = [];
        ui.clearHighlights();
      } else {
        // Select new piece
        state.selectedPiece = { row, col };
        state.validMoves = getValidMovesClient(state.board, row, col);
        ui.showHighlights(row, col, state.validMoves);
      }
      return;
    }

    // Move selected piece
    if (sel) {
      const isValid = state.validMoves.some(([mr, mc]) => mr === row && mc === col);
      if (!isValid) {
        // click empty/invalid – deselect
        state.selectedPiece = null;
        state.validMoves = [];
        ui.clearHighlights();
        return;
      }
      executePlayerMove(sel.row, sel.col, row, col);
    }
  }

  function executePlayerMove(fromRow, fromCol, toRow, toCol) {
    const piece = state.board[fromRow][fromCol];
    const captured = state.board[toRow][toCol];

    ui.stopAiTimer();
    const aiColor = state.myColor === 'r' ? 'b' : 'r';
    state.board[toRow][toCol] = piece;
    state.board[fromRow][fromCol] = null;
    state.selectedPiece = null;
    state.validMoves = [];
    state.lastMove = { fromRow, fromCol, toRow, toCol };
    state.currentTurnColor = aiColor;
    state.isPlayerTurn = false;

    ui.applyMove(fromRow, fromCol, toRow, toCol, piece, captured);
    ui.clearHighlights();
    ui.showLastMove(fromRow, fromCol, toRow, toCol);
    ui.addMoveLog(ui.getLang() === 'en' ? 'You' : 'Bạn', piece, fromRow, fromCol, toRow, toCol, captured);

    const inChk = isInCheck(state.board, aiColor);
    if (inChk) {
      const king = findKing(state.board, aiColor);
      if (king) ui.showCheckHighlight(king[0], king[1]);
    }

    // Check if AI is in checkmate / stalemate
    if (isCheckmate(state.board, aiColor)) {
      state.isGameOver = true;
      setTimeout(() => {
        ui.showWinner({ winner: ui.getLang() === 'en' ? 'You' : 'Bạn', reason: inChk ? 'checkmate' : 'stalemate', isAiMode: true });
      }, 600);
      return;
    }

    // Switch timer to AI (no actual decrement for AI)
    ui.updateTurnUI({ isAI: true, color: aiColor });

    // Small delay for realism then trigger AI
    aiThinking = true;
    setTimeout(triggerAiMove, 400 + Math.random() * 600);
  }

  function triggerAiMove() {
    if (state.isGameOver) { aiThinking = false; return; }
    const boardSnapshot = state.board.map(r => r.map(c => c ? { ...c } : null));
    const aiColor = state.myColor === 'r' ? 'b' : 'r';
    getWorker().postMessage({ board: boardSnapshot, color: aiColor, difficulty: state.aiDifficulty });
  }

  function handleWorkerMessage({ data: move }) {
    aiThinking = false;
    if (state.isGameOver || !move) return;

    const { fromRow, fromCol, toRow, toCol } = move;
    const piece = state.board[fromRow][fromCol];
    if (!piece) return;
    const captured = state.board[toRow][toCol];

    state.board[toRow][toCol] = piece;
    state.board[fromRow][fromCol] = null;
    state.currentTurnColor = state.myColor;
    state.isPlayerTurn = true;
    state.lastMove = { fromRow, fromCol, toRow, toCol };

    ui.applyMove(fromRow, fromCol, toRow, toCol, piece, captured);
    ui.clearHighlights();
    ui.showLastMove(fromRow, fromCol, toRow, toCol);
    ui.addMoveLog('AI', piece, fromRow, fromCol, toRow, toCol, captured);

    const playerColor = state.myColor;
    const inChk = isInCheck(state.board, playerColor);
    if (inChk) {
      const king = findKing(state.board, playerColor);
      if (king) ui.showCheckHighlight(king[0], king[1]);
    }

    // Check if player is in checkmate / stalemate
    if (isCheckmate(state.board, playerColor)) {
      state.isGameOver = true;
      setTimeout(() => {
        ui.showWinner({ winner: 'AI', reason: inChk ? 'checkmate' : 'stalemate', isAiMode: true });
      }, 600);
      return;
    }

    ui.updateTurnUI({ isAI: true, color: state.myColor });
    ui.startAiTimer(state.myColor === 'r' ? 0 : 1); // resume player's timer
  }

  function resign() {
    if (state.isGameOver) return;
    if (!confirm(ui.getLang() === 'en' ? 'Resign?' : 'Đầu hàng?')) return;
    state.isGameOver = true;
    ui.stopAiTimer();
    if (worker) { worker.terminate(); worker = null; }
    ui.showWinner({ winner: 'AI', reason: 'resign', isAiMode: true });
  }

  function restart() {
    startGame(state.aiDifficulty);
  }

  return { startGame, restart, resign };
}
