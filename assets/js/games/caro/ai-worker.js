// ai-worker.js – runs entirely in a Web Worker background thread
// No imports needed – everything is self-contained

const BOARD_SIZE = 20;
const WIN_SCORE = 10_000_000;

// ─── Heuristic ────────────────────────────────────────────────────────────────
function scoreSequence(count, openEnds) {
  if (count >= 5) return WIN_SCORE;
  if (count === 4) return openEnds >= 2 ? 500_000 : 50_000;
  if (count === 3) return openEnds >= 2 ? 50_000  : 1_000;
  if (count === 2) return openEnds >= 2 ? 1_000   : 100;
  return 0;
}

function evaluateBoard(board, symbol) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  let score = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== symbol) continue;
      for (const [dr, dc] of directions) {
        const pr = r - dr, pc = c - dc;
        if (pr >= 0 && pr < BOARD_SIZE && pc >= 0 && pc < BOARD_SIZE && board[pr][pc] === symbol) continue;
        let count = 0; let nr = r, nc = c;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === symbol) { count++; nr += dr; nc += dc; }
        let openEnds = 0;
        if (r-dr >= 0 && r-dr < BOARD_SIZE && c-dc >= 0 && c-dc < BOARD_SIZE && board[r-dr][c-dc] === null) openEnds++;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) openEnds++;
        score += scoreSequence(count, openEnds);
      }
    }
  }
  return score;
}

// ─── Win check ────────────────────────────────────────────────────────────────
function checkWin(board, row, col, symbol) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let d = 1; d < 5; d++) { const r=row+dr*d, c=col+dc*d; if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol) break; count++; }
    for (let d = 1; d < 5; d++) { const r=row-dr*d, c=col-dc*d; if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol) break; count++; }
    if (count >= 5) return true;
  }
  return false;
}

// ─── Candidate moves – radius=1, scored & capped ──────────────────────────────
function getCandidates(board, aiSym, humanSym, maxCount = 15) {
  const seen = new Set();
  let hasAny = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) continue;
      hasAny = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc]===null)
            seen.add(nr * BOARD_SIZE + nc);
        }
      }
    }
  }
  if (!hasAny) {
    const center = Math.floor(BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }

  // Score each candidate to prioritise promising moves (move ordering)
  const scored = [...seen].map(key => {
    const row = Math.floor(key / BOARD_SIZE), col = key % BOARD_SIZE;
    board[row][col] = aiSym;
    const aiScore = evaluateBoard(board, aiSym);
    board[row][col] = humanSym;
    const humScore = evaluateBoard(board, humanSym);
    board[row][col] = null;
    return { row, col, score: aiScore + humScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

// ─── Minimax ──────────────────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) return evaluateBoard(board, aiSym) - evaluateBoard(board, humanSym);

  const candidates = getCandidates(board, aiSym, humanSym, 12);
  if (candidates.length === 0) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSym;
      const score = minimax(board, depth-1, alpha, beta, false, aiSym, humanSym, { row, col });
      board[row][col] = null;
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = humanSym;
      const score = minimax(board, depth-1, alpha, beta, true, aiSym, humanSym, { row, col });
      board[row][col] = null;
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────
self.onmessage = function({ data }) {
  const { board, aiSymbol, difficulty } = data;
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';

  // depth per difficulty
  const depthMap = { easy: 1, medium: 2, hard: 3 };
  const depth = depthMap[difficulty] ?? 2;

  // Easy: 45% random
  const candidates = getCandidates(board, aiSymbol, humanSymbol, 20);
  if (difficulty === 'easy' && Math.random() < 0.45) {
    self.postMessage(candidates[Math.floor(Math.random() * candidates.length)]);
    return;
  }

  // Immediate win
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
    board[row][col] = null;
  }

  // Block immediate loss (medium/hard)
  if (difficulty !== 'easy') {
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
      board[row][col] = null;
    }
  }

  // Minimax
  let bestScore = -Infinity, bestMove = candidates[0];
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
    board[row][col] = null;
    if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
  }

  self.postMessage(bestMove);
};
