// ai-worker.js – runs entirely in a Web Worker background thread
// No imports needed – everything is self-contained

const BOARD_SIZE = 20;
const WIN_SCORE = 10_000_000;

// ─── Pattern scoring – phân biệt rõ mức độ nguy hiểm ────────────────────────
// openEnds: 0 = bị chặn cả 2 đầu, 1 = một đầu mở, 2 = hai đầu mở
function scoreSequence(count, openEnds) {
  if (count >= 5) return WIN_SCORE;

  // 4 quân
  if (count === 4) {
    if (openEnds >= 2) return 500_000; // 4 hai đầu mở → gần như thắng
    if (openEnds === 1) return 100_000; // 4 một đầu mở → rất nguy
    return 0;
  }

  // 3 quân
  if (count === 3) {
    if (openEnds >= 2) return 50_000;  // 3 hai đầu mở → rất nguy (double threat tiềm năng)
    if (openEnds === 1) return 5_000;
    return 0;
  }

  // 2 quân
  if (count === 2) {
    if (openEnds >= 2) return 500;
    if (openEnds === 1) return 50;
    return 0;
  }

  return 10; // 1 quân đơn lẻ
}

// ─── Evaluate board ──────────────────────────────────────────────────────────
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

// ─── Threat scanner: đếm số "mối đe dọa" của một symbol ──────────────────────
// Trả về { win4: n, open3: n, closed3: n } để AI quyết định ưu tiên
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

// ─── Candidate moves – radius=2, scored & capped ──────────────────────────────
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

  // Score each candidate – ưu tiên move theo attack+defense score
  const scored = [...seen].map(key => {
    const row = Math.floor(key / BOARD_SIZE), col = key % BOARD_SIZE;
    board[row][col] = aiSym;
    const aiScore = evaluateBoard(board, aiSym);
    board[row][col] = humanSym;
    const humScore = evaluateBoard(board, humanSym);
    board[row][col] = null;

    // Defense score được nhân hệ số cao hơn để ưu tiên chặn
    return { row, col, score: aiScore + humScore * 1.1 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

// ─── Minimax ──────────────────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) return evaluateBoard(board, aiSym) - evaluateBoard(board, humanSym) * 1.1;

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

// ─── Hard mode: tìm nước đi tạo "double threat" (fork) ──────────────────────
// Trả về move mà sau đó AI có 2+ mối đe dọa cùng lúc (không thể chặn hết)
function findForkMove(board, aiSym, humanSym, candidates) {
  let bestFork = null;
  let bestForkScore = 0;

  for (const { row, col } of candidates) {
    board[row][col] = aiSym;
    const threats = scanThreats(board, aiSym);
    // Đếm số mối đe dọa: win4 (sắp thắng) + open3 (3 hai đầu mở)
    const forkScore = threats.win4 * 10 + threats.open3 * 3 + threats.closed3;
    board[row][col] = null;

    if (forkScore > bestForkScore) {
      bestForkScore = forkScore;
      bestFork = { row, col };
    }
  }

  // Chỉ trả về nếu thực sự tạo được 2+ mối đe dọa
  if (bestForkScore >= 3) return bestFork;
  return null;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
self.onmessage = function({ data }) {
  const { board, aiSymbol, difficulty } = data;
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';

  const candidates = getCandidates(board, aiSymbol, humanSymbol, 20);

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: DỄ (Easy)
  // - Luôn thắng ngay nếu có nước thắng
  // - Luôn chặn nếu người chơi sắp thắng (4 quân)
  // - Còn lại: 50% random, 50% heuristic thấp (depth 1)
  // ══════════════════════════════════════════════════════════════════════
  if (difficulty === 'easy') {
    // 1. Thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
      board[row][col] = null;
    }

    // 2. Chặn người chơi thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
      board[row][col] = null;
    }

    // 3. 50% ngẫu nhiên từ top candidate (không hoàn toàn random, vẫn chọn từ vùng nguy hiểm)
    if (Math.random() < 0.50) {
      const topN = candidates.slice(0, Math.min(8, candidates.length));
      self.postMessage(topN[Math.floor(Math.random() * topN.length)]);
      return;
    }

    // 4. Minimax depth 1
    let bestScore = -Infinity, bestMove = candidates[0];
    for (const { row, col } of candidates.slice(0, 12)) {
      board[row][col] = aiSymbol;
      const score = minimax(board, 0, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
    }
    self.postMessage(bestMove);
    return;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: TRUNG BÌNH (Medium)
  // - Luôn thắng ngay
  // - Luôn chặn khi người có 4 quân (sắp thắng)
  // - Chặn khi người có 3 quân HAI ĐẦU MỞ (nguy hiểm)
  // - Minimax depth 3
  // ══════════════════════════════════════════════════════════════════════
  if (difficulty === 'medium') {
    // 1. Thắng ngay
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
      board[row][col] = null;
    }

    // 2. Chặn người thắng ngay (4 quân)
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
      board[row][col] = null;
    }

    // 3. Chặn 3 quân HAI ĐẦU MỞ của người (nguy hiểm nhất sau 4 quân)
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      const threats = scanThreats(board, humanSymbol);
      board[row][col] = null;
      // Nếu phe người tạo được open3 hoặc win4 sau khi đánh ô này → phải chặn
      // Kiểm tra nhanh: ô này có tạo thêm chuỗi 3 hai đầu mở không?
    }

    // Scan toàn bộ bàn cờ để tìm open3 của người
    const humanThreats = scanThreats(board, humanSymbol);
    if (humanThreats.open3 >= 1) {
      // Tìm ô chặn tốt nhất: đánh vào đó làm giảm open3
      let bestBlock = null;
      let bestBlockScore = -Infinity;
      for (const { row, col } of candidates) {
        board[row][col] = aiSymbol; // AI đánh vào đây
        const after = scanThreats(board, humanSymbol);
        board[row][col] = null;
        // Score: giảm open3 của đối thủ càng nhiều càng tốt
        const blockScore = (humanThreats.open3 - after.open3) * 1000 + (humanThreats.win4 - after.win4) * 5000;
        if (blockScore > bestBlockScore) {
          bestBlockScore = blockScore;
          bestBlock = { row, col };
        }
      }
      // Chỉ chặn nếu nó thực sự làm giảm mối đe dọa
      if (bestBlock && bestBlockScore > 0) {
        self.postMessage(bestBlock);
        return;
      }
    }

    // 4. Minimax depth 3
    let bestScore = -Infinity, bestMove = candidates[0];
    for (const { row, col } of candidates.slice(0, 15)) {
      board[row][col] = aiSymbol;
      const score = minimax(board, 2, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
    }
    self.postMessage(bestMove);
    return;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ĐỘ KHÓ: KHÓ (Hard) – CỰC KỲ TINH VI
  // Priority order:
  //   1. Thắng ngay (5 quân)
  //   2. Chặn người thắng ngay
  //   3. Tạo nước "fork" - 2 mối đe dọa cùng lúc (không thể chặn hết)
  //   4. Chặn fork của người (nếu người sắp tạo fork)
  //   5. Chặn 4 quân một đầu mở (sẽ thắng sau 1 nước)
  //   6. Chặn 3 quân hai đầu mở (open3 – nguy hiểm thứ 2)
  //   7. Minimax depth 4 với move ordering tốt
  // ══════════════════════════════════════════════════════════════════════

  // 1. Thắng ngay
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
    board[row][col] = null;
  }

  // 2. Chặn người thắng ngay (TUYỆT ĐỐI ƯU TIÊN)
  for (const { row, col } of candidates) {
    board[row][col] = humanSymbol;
    if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; self.postMessage({ row, col }); return; }
    board[row][col] = null;
  }

  // 3. Tạo fork cho AI (nếu tạo được 2+ mối đe dọa không thể chặn hết)
  const aiFork = findForkMove(board, aiSymbol, humanSymbol, candidates);
  if (aiFork) {
    // Trước khi chọn fork, kiểm tra người có đang đe dọa không
    const humanThreatsNow = scanThreats(board, humanSymbol);
    if (humanThreatsNow.win4 === 0 && humanThreatsNow.open3 === 0) {
      self.postMessage(aiFork);
      return;
    }
  }

  // 4. Chặn người tạo fork
  const humanFork = findForkMove(board, humanSymbol, aiSymbol, candidates);
  if (humanFork) {
    // Trước khi chặn fork, thử xem AI có nước attack tốt hơn không
    const aiForkScore = aiFork ? (() => {
      board[aiFork.row][aiFork.col] = aiSymbol;
      const t = scanThreats(board, aiSymbol);
      board[aiFork.row][aiFork.col] = null;
      return t.win4 * 10 + t.open3 * 3;
    })() : 0;

    if (aiForkScore < 10) { // Không có attack đủ mạnh → chặn fork người
      self.postMessage(humanFork);
      return;
    }
  }

  // 5. Tạo 4 quân HOẶC chặn 4 quân một đầu mở của người
  for (const { row, col } of candidates) {
    // Tạo 4 cho AI
    board[row][col] = aiSymbol;
    const aiT = scanThreats(board, aiSymbol);
    board[row][col] = null;
    if (aiT.win4 >= 1) { self.postMessage({ row, col }); return; }
  }

  for (const { row, col } of candidates) {
    // Chặn 4 một đầu mở của người
    board[row][col] = humanSymbol;
    const hT = scanThreats(board, humanSymbol);
    board[row][col] = null;
    if (hT.win4 >= 1) { self.postMessage({ row, col }); return; }
  }

  // 6. Tạo hoặc chặn open3 (3 quân hai đầu mở)
  // Ưu tiên: nếu người có open3 → phải chặn ngay
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
    if (bestBlock && bestBlockScore > 0) {
      self.postMessage(bestBlock);
      return;
    }
  }

  // 7. Minimax depth 4 với scoring ưu tiên phòng thủ
  let bestScore = -Infinity, bestMove = candidates[0];
  for (const { row, col } of candidates.slice(0, 15)) {
    board[row][col] = aiSymbol;
    const score = minimax(board, 3, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
    board[row][col] = null;
    if (score > bestScore) { bestScore = score; bestMove = { row, col }; }
  }
  self.postMessage(bestMove);
};
