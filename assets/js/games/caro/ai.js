import { BOARD_SIZE } from './constants.js';

const WIN_SCORE = 10_000_000;

// ─── Pattern scoring – phân biệt rõ mức độ nguy hiểm ──────────────────────────
function scoreSequence(count, openEnds) {
  if (count >= 5) return WIN_SCORE;
  if (count === 4) {
    if (openEnds >= 2) return 500_000;
    if (openEnds === 1) return 100_000;
    return 0;
  }
  if (count === 3) {
    if (openEnds >= 2) return 50_000;
    if (openEnds === 1) return 5_000;
    return 0;
  }
  if (count === 2) {
    if (openEnds >= 2) return 500;
    if (openEnds === 1) return 50;
    return 0;
  }
  return 10;
}

// ─── Evaluate board ───────────────────────────────────────────────────────────
function evaluateBoard(board, symbol) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let score = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      for (const [dr, dc] of directions) {
        if (board[r][c] !== symbol) continue;
        const pr = r - dr, pc = c - dc;
        if (pr >= 0 && pr < BOARD_SIZE && pc >= 0 && pc < BOARD_SIZE && board[pr][pc] === symbol) continue;

        let count = 0;
        let nr = r, nc = c;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === symbol) {
          count++;
          nr += dr;
          nc += dc;
        }

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

// ─── Threat scanner ───────────────────────────────────────────────────────────
function scanThreats(board, symbol) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  let win4 = 0, open3 = 0, closed3 = 0, open2 = 0;
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
        if (count === 4 && openEnds >= 1) win4++;
        else if (count === 3 && openEnds >= 2) open3++;
        else if (count === 3 && openEnds === 1) closed3++;
        else if (count === 2 && openEnds >= 2) open2++;
      }
    }
  }
  return { win4, open3, closed3, open2 };
}

// ─── Candidate moves ──────────────────────────────────────────────────────────
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

  const scored = [...seen].map(key => {
    const row = Math.floor(key / BOARD_SIZE), col = key % BOARD_SIZE;
    board[row][col] = aiSym;
    const aiScore = evaluateBoard(board, aiSym);
    board[row][col] = humanSym;
    const humScore = evaluateBoard(board, humanSym);
    board[row][col] = null;
    // Hệ số 1.1 cho phòng thủ để ưu tiên chặn
    return { row, col, score: aiScore + humScore * 1.1 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

// ─── Win check ────────────────────────────────────────────────────────────────
export function checkWin(board, row, col, symbol) {
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

// ─── Minimax ──────────────────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSymbol, humanSymbol, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSymbol : aiSymbol)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) {
    return evaluateBoard(board, aiSymbol) - evaluateBoard(board, humanSymbol) * 1.1;
  }

  const candidates = getCandidates(board, aiSymbol, humanSymbol, 12);
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

// ─── Fork finder – tìm nước tạo 2+ mối đe dọa cùng lúc ───────────────────────
function findForkMove(board, aiSym, humanSym, candidates) {
  let bestFork = null;
  let bestForkScore = 0;

  for (const { row, col } of candidates) {
    board[row][col] = aiSym;
    const threats = scanThreats(board, aiSym);
    const forkScore = threats.win4 * 10 + threats.open3 * 3 + threats.closed3;
    board[row][col] = null;

    if (forkScore > bestForkScore) {
      bestForkScore = forkScore;
      bestFork = { row, col };
    }
  }

  if (bestForkScore >= 3) return bestFork;
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * difficulty: 'easy' | 'medium' | 'hard'
 * Returns { row, col } best move for AI
 */
export function getBestMove(board, aiSymbol, difficulty = 'hard') {
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const candidates = getCandidates(board, aiSymbol, humanSymbol, 20);

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: DỄ
  // ══════════════════════════════════════════════════════════════════════
  if (difficulty === 'easy') {
    // 1. Thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    // 2. Chặn người thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    // 3. 50% random từ top candidates
    if (Math.random() < 0.50) {
      const topN = candidates.slice(0, Math.min(8, candidates.length));
      return topN[Math.floor(Math.random() * topN.length)];
    }
    // 4. Minimax depth 1
    let bestScore = -Infinity, bestMove = candidates[0];
    for (const { row, col } of candidates.slice(0, 12)) {
      board[row][col] = aiSymbol;
      const score = minimax(board, 0, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
    }
    return bestMove;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: TRUNG BÌNH
  // ══════════════════════════════════════════════════════════════════════
  if (difficulty === 'medium') {
    // 1. Thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    // 2. Chặn người thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    // 3. Chặn open3 của người
    const humanThreats = scanThreats(board, humanSymbol);
    if (humanThreats.open3 >= 1) {
      let bestBlock = null, bestBlockScore = -Infinity;
      for (const { row, col } of candidates) {
        board[row][col] = aiSymbol;
        const after = scanThreats(board, humanSymbol);
        board[row][col] = null;
        const blockScore = (humanThreats.open3 - after.open3) * 1000 + (humanThreats.win4 - after.win4) * 5000;
        if (blockScore > bestBlockScore) { bestBlockScore = blockScore; bestBlock = { row, col }; }
      }
      if (bestBlock && bestBlockScore > 0) return bestBlock;
    }
    // 4. Minimax depth 3
    let bestScore = -Infinity, bestMove = candidates[0];
    for (const { row, col } of candidates.slice(0, 15)) {
      board[row][col] = aiSymbol;
      const score = minimax(board, 2, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
    }
    return bestMove;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: KHÓ (Hard) – CỰC KỲ TINH VI
  // ══════════════════════════════════════════════════════════════════════

  // 1. Thắng ngay
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
    board[row][col] = null;
  }

  // 2. Chặn người thắng ngay (TUYỆT ĐỐI ƯU TIÊN)
  for (const { row, col } of candidates) {
    board[row][col] = humanSymbol;
    if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
    board[row][col] = null;
  }

  // 3. Tạo fork cho AI
  const aiFork = findForkMove(board, aiSymbol, humanSymbol, candidates);
  if (aiFork) {
    const humanThreatsNow = scanThreats(board, humanSymbol);
    if (humanThreatsNow.win4 === 0 && humanThreatsNow.open3 === 0) {
      return aiFork;
    }
  }

  // 4. Chặn fork của người
  const humanFork = findForkMove(board, humanSymbol, aiSymbol, candidates);
  if (humanFork) {
    const aiForkScore = aiFork ? (() => {
      board[aiFork.row][aiFork.col] = aiSymbol;
      const t = scanThreats(board, aiSymbol);
      board[aiFork.row][aiFork.col] = null;
      return t.win4 * 10 + t.open3 * 3;
    })() : 0;
    if (aiForkScore < 10) return humanFork;
  }

  // 5. Tạo 4 quân
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    const aiT = scanThreats(board, aiSymbol);
    board[row][col] = null;
    if (aiT.win4 >= 1) return { row, col };
  }

  // 6. Chặn 4 quân một đầu mở của người
  for (const { row, col } of candidates) {
    board[row][col] = humanSymbol;
    const hT = scanThreats(board, humanSymbol);
    board[row][col] = null;
    if (hT.win4 >= 1) return { row, col };
  }

  // 7. Chặn open3 của người
  const humanThreats = scanThreats(board, humanSymbol);
  if (humanThreats.open3 >= 1) {
    let bestBlock = null, bestBlockScore = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      const after = scanThreats(board, humanSymbol);
      const aiAfter = scanThreats(board, aiSymbol);
      board[row][col] = null;
      const blockScore = (humanThreats.open3 - after.open3) * 2000
                       + (humanThreats.win4  - after.win4)  * 5000
                       + aiAfter.win4 * 3000 + aiAfter.open3 * 500;
      if (blockScore > bestBlockScore) { bestBlockScore = blockScore; bestBlock = { row, col }; }
    }
    if (bestBlock && bestBlockScore > 0) return bestBlock;
  }

  // 8. Minimax depth 4
  let bestScore = -Infinity;
  let bestMove = candidates[0];

  for (const { row, col } of candidates.slice(0, 15)) {
    board[row][col] = aiSymbol;
    const score = minimax(board, 3, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
    board[row][col] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}
