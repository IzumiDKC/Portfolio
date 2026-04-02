import { BOARD_SIZE } from './constants.js';

// ─── Heuristic scoring patterns ───────────────────────────────────────────────
// Score a line of cells (e.g., 5 consecutive in any direction)
// Returns the score contribution for `symbol` in that line

const WIN_SCORE = 10_000_000;

const SCORE_MAP = {
  // [count, openEnds] => score
  five:  WIN_SCORE,
  four_open:  500_000,
  four_closed: 50_000,
  three_open: 50_000,
  three_closed: 1_000,
  two_open:   1_000,
  two_closed:   100,
};

function scoreSequence(count, openEnds) {
  if (count >= 5) return SCORE_MAP.five;
  if (count === 4) return openEnds >= 2 ? SCORE_MAP.four_open : SCORE_MAP.four_closed;
  if (count === 3) return openEnds >= 2 ? SCORE_MAP.three_open : SCORE_MAP.three_closed;
  if (count === 2) return openEnds >= 2 ? SCORE_MAP.two_open : SCORE_MAP.two_closed;
  return 0;
}

// Evaluate the board score for `symbol` from `attacker`'s perspective
function evaluateBoard(board, symbol) {
  const opponent = symbol === 'X' ? 'O' : 'X';
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let score = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      for (const [dr, dc] of directions) {
        // Count consecutive cells for `symbol`
        if (board[r][c] !== symbol) continue;

        // Check if already counted (previous cell in same direction is same symbol)
        const pr = r - dr, pc = c - dc;
        if (pr >= 0 && pr < BOARD_SIZE && pc >= 0 && pc < BOARD_SIZE && board[pr][pc] === symbol) continue;

        let count = 0;
        let nr = r, nc = c;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === symbol) {
          count++;
          nr += dr;
          nc += dc;
        }

        // Check open ends
        let openEnds = 0;
        const beforeR = r - dr, beforeC = c - dc;
        if (beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === null) openEnds++;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) openEnds++;

        score += scoreSequence(count, openEnds);
      }
    }
  }
  return score;
}

// ─── Candidate moves (cells near existing stones) ─────────────────────────────
function getCandidates(board, radius = 2) {
  const candidates = new Set();
  let hasAny = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) continue;
      hasAny = true;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) {
            candidates.add(nr * BOARD_SIZE + nc);
          }
        }
      }
    }
  }

  // First move – play center
  if (!hasAny) {
    const center = Math.floor(BOARD_SIZE / 2);
    candidates.add(center * BOARD_SIZE + center);
  }

  return [...candidates].map(key => ({ row: Math.floor(key / BOARD_SIZE), col: key % BOARD_SIZE }));
}

// ─── Win check ────────────────────────────────────────────────────────────────
function checkWin(board, row, col, symbol) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const r = row + dr * d, c = col + dc * d;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
      count++;
    }
    for (let d = 1; d < 5; d++) {
      const r = row - dr * d, c = col - dc * d;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

// ─── Minimax with Alpha-Beta Pruning ─────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSymbol, humanSymbol, lastMove) {
  // Terminal checks
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSymbol : aiSymbol)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) {
    return evaluateBoard(board, aiSymbol) - evaluateBoard(board, humanSymbol);
  }

  const candidates = getCandidates(board);
  if (candidates.length === 0) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      const score = minimax(board, depth - 1, alpha, beta, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      const score = minimax(board, depth - 1, alpha, beta, true, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * difficulty: 'easy' | 'medium' | 'hard'
 * Returns { row, col } best move for AI
 */
export function getBestMove(board, aiSymbol, difficulty = 'hard') {
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';

  // Depth per difficulty
  const depthMap = { easy: 1, medium: 2, hard: 4 };
  const depth = depthMap[difficulty] ?? 4;

  // Easy: 40% chance to play a random candidate move
  const candidates = getCandidates(board);

  if (difficulty === 'easy' && Math.random() < 0.45) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Immediately win if possible
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    if (checkWin(board, row, col, aiSymbol)) {
      board[row][col] = null;
      return { row, col };
    }
    board[row][col] = null;
  }

  // Block opponent if about to win (skip for easy)
  if (difficulty !== 'easy') {
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) {
        board[row][col] = null;
        return { row, col };
      }
      board[row][col] = null;
    }
  }

  // Run minimax
  let bestScore = -Infinity;
  let bestMove = candidates[0];

  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
    board[row][col] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}

export { checkWin };
