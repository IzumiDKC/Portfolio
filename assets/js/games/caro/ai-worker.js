// ai-worker.js – Web Worker AI for Caro (Gomoku 5-in-a-row)
// Hard mode: Threat-5 engine — detects ALL forced wins up to depth 5

const BOARD_SIZE = 20;
const WIN_SCORE  = 10_000_000;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

// ─── MLEngine: Pattern-based Q-Learning ───────────────────────────────────────
const MAX_QTABLE = 8000;
const OPENING_K  = 3;

class MLEngine {
  constructor(data = {}) {
    this.qTable       = data.qTable       || {};
    this.openingStats = data.openingStats || {};
    this.gamesPlayed  = data.gamesPlayed  || 0;
    this.gameTrace    = [];
  }

  patternHash(board, row, col, aiSym) {
    let h = '';
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) { h += '#'; continue; }
        const v = board[r][c];
        h += v === null ? '_' : v === aiSym ? 'A' : 'H';
      }
    return h;
  }

  getBias(board, row, col, aiSym) {
    return this.qTable[this.patternHash(board, row, col, aiSym)] || 0;
  }

  recordMove(board, row, col, aiSym) {
    this.gameTrace.push(this.patternHash(board, row, col, aiSym));
  }

  learn(result, openingKey) {
    const reward = result === 'win' ? 1.5 : result === 'lose' ? -3.0 : 0.1;
    const alpha = 0.4, gamma = 0.85;
    let disc = reward;
    for (let i = this.gameTrace.length - 1; i >= 0; i--) {
      const h = this.gameTrace[i];
      const q = this.qTable[h] || 0;
      this.qTable[h] = Math.max(-1, Math.min(1, q + alpha * (disc - q)));
      disc *= gamma;
    }
    if (openingKey) {
      if (!this.openingStats[openingKey])
        this.openingStats[openingKey] = { count: 0, humanWins: 0 };
      this.openingStats[openingKey].count++;
      if (result === 'lose') this.openingStats[openingKey].humanWins++;
    }
    this.gamesPlayed++;
    this.gameTrace = [];
  }

  isExploitedOpening(humanMoves) {
    if (humanMoves.length < OPENING_K) return false;
    const key = humanMoves.slice(0, OPENING_K).join('|');
    const s = this.openingStats[key];
    return s && s.count >= 1 && (s.humanWins / s.count) >= 0.5;
  }

  get mlWeight() {
    if (this.gamesPlayed === 0) return 0.8;
    if (this.gamesPlayed < 5)  return 1.0;
    if (this.gamesPlayed < 20) return 1.3;
    return 1.8;
  }

  serialize() {
    const pruned = Object.fromEntries(
      Object.entries(this.qTable)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, MAX_QTABLE)
    );
    return { qTable: pruned, openingStats: this.openingStats, gamesPlayed: this.gamesPlayed };
  }
}

let ml = new MLEngine();

// ─── Win check ────────────────────────────────────────────────────────────────
function checkWin(board, row, col, symbol) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let d=1;d<5;d++){const r=row+dr*d,c=col+dc*d;if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol)break;count++;}
    for (let d=1;d<5;d++){const r=row-dr*d,c=col-dc*d;if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol)break;count++;}
    if (count >= 5) return true;
  }
  return false;
}

// ─── Fast local threat scanner ───────────────────────────────────────────────
// Only scans the 4 lines passing through (row,col) instead of entire board.
// Returns: { five, open4, broken4, open3, broken3 }
function fastThreatsAt(board, row, col, sym) {
  const opp = sym === 'X' ? 'O' : 'X';
  let five = 0, open4 = 0, broken4 = 0, open3 = 0, broken3 = 0;

  for (const [dr, dc] of DIRS) {
    // Extract the line through (row,col) in this direction, up to 9 cells
    const line = [];
    const startR = row - dr * 4, startC = col - dc * 4;
    for (let i = 0; i < 9; i++) {
      const r = startR + dr * i, c = startC + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE)
        line.push('W'); // wall
      else
        line.push(board[r][c]);
    }

    // Scan windows of 5 and 6 within this line
    for (let s = 0; s <= 4; s++) {
      // Window of 5
      let symC5 = 0, oppC5 = 0;
      for (let i = s; i < s + 5; i++) {
        if (line[i] === sym) symC5++;
        else if (line[i] !== null) oppC5++; // opp or wall
      }
      if (oppC5 === 0) {
        if (symC5 === 5) five++;
        else if (symC5 === 4) broken4++;
        else if (symC5 === 3) broken3++;
      }
    }

    for (let s = 0; s <= 3; s++) {
      // Window of 6
      let symC6 = 0, oppC6 = 0;
      for (let i = s; i < s + 6; i++) {
        if (line[i] === sym) symC6++;
        else if (line[i] !== null) oppC6++;
      }
      if (oppC6 === 0 && line[s] === null && line[s + 5] === null) {
        let innerSym = 0;
        for (let i = s + 1; i < s + 5; i++)
          if (line[i] === sym) innerSym++;
        if (innerSym === 4) open4++;
        else if (innerSym === 3) open3++;
      }
    }
  }
  return { five, open4, broken4, open3, broken3 };
}

// ─── Full board threat classifier (uses fast local scan) ─────────────────────
function classifyThreats(board, sym) {
  let five = 0, open4 = 0, broken4 = 0, open3 = 0, broken3 = 0;
  const opp = sym === 'X' ? 'O' : 'X';
  const visited = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== sym) continue;

      for (const [dr, dc] of DIRS) {
        // Normalize line start to avoid double-counting
        let sr = r, sc = c;
        while (sr - dr >= 0 && sr - dr < BOARD_SIZE &&
               sc - dc >= 0 && sc - dc < BOARD_SIZE &&
               board[sr - dr][sc - dc] === sym) {
          sr -= dr; sc -= dc;
        }
        const key = `${sr},${sc},${dr},${dc}`;
        if (visited.has(key)) continue;
        visited.add(key);

        // Count consecutive
        let count = 0, er = sr, ec = sc;
        while (er >= 0 && er < BOARD_SIZE && ec >= 0 && ec < BOARD_SIZE && board[er][ec] === sym) {
          count++; er += dr; ec += dc;
        }
        if (count >= 5) { five++; continue; }

        // Check ends
        const beforeR = sr - dr, beforeC = sc - dc;
        const afterR = er, afterC = ec;
        const beforeOpen = beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === null;
        const afterOpen = afterR >= 0 && afterR < BOARD_SIZE && afterC >= 0 && afterC < BOARD_SIZE && board[afterR][afterC] === null;

        if (count === 4) {
          if (beforeOpen && afterOpen) open4++;
          else if (beforeOpen || afterOpen) broken4++;
        } else if (count === 3) {
          if (beforeOpen && afterOpen) open3++;
          else if (beforeOpen || afterOpen) broken3++;
        }
      }
    }
  }
  // Also check gapped patterns (X_XXX, XX_XX, etc.) for broken4
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const w5 = [];
        let ok = true;
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { ok = false; break; }
          w5.push(board[nr][nc]);
        }
        if (!ok) continue;
        let sc5 = 0, oc5 = 0, gaps = 0;
        for (const v of w5) {
          if (v === sym) sc5++;
          else if (v === null) gaps++;
          else oc5++;
        }
        // Gapped 4: exactly 4 of sym + 1 gap + 0 opp, and NOT consecutive (already counted)
        if (sc5 === 4 && gaps === 1 && oc5 === 0) {
          // Check it's actually gapped (not consecutive with an end space)
          const pat = w5.map(v => v === sym ? 'X' : '_').join('');
          if (pat !== 'XXXX_' && pat !== '_XXXX') {
            broken4++;
          }
        }
      }
    }
  }
  return { five, open4, broken4, open3, broken3 };
}

// ─── Move creates fork? ─────────────────────────────────────────────────────
function moveCreatesFork(board, row, col, sym) {
  board[row][col] = sym;
  const t = fastThreatsAt(board, row, col, sym);
  board[row][col] = null;
  // Fork = multiple simultaneous threats that can't all be blocked
  return (t.open4 >= 1) ||
         (t.broken4 >= 2) ||
         (t.open3 >= 2) ||
         (t.broken4 >= 1 && t.open3 >= 1);
}

// ─── Find empty ends of consecutive N-length lines (for blocking) ────────────
// If requireBothOpen=true, only returns ends of lines that have BOTH ends open (open-4)
// If requireBothOpen=false, returns any open end of a consecutive N-length line
function findLineEndBlocks(board, sym, n, requireBothOpen) {
  const spots = [];
  const visited = new Set();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== sym) continue;
      for (const [dr, dc] of DIRS) {
        // Normalize to start of consecutive run
        let sr = r, sc = c;
        while (sr - dr >= 0 && sr - dr < BOARD_SIZE &&
               sc - dc >= 0 && sc - dc < BOARD_SIZE &&
               board[sr - dr][sc - dc] === sym) {
          sr -= dr; sc -= dc;
        }
        const key = `${sr},${sc},${dr},${dc}`;
        if (visited.has(key)) continue;
        visited.add(key);

        // Count consecutive
        let count = 0, er = sr, ec = sc;
        while (er >= 0 && er < BOARD_SIZE && ec >= 0 && ec < BOARD_SIZE && board[er][ec] === sym) {
          count++; er += dr; ec += dc;
        }
        if (count !== n) continue;

        const bR = sr - dr, bC = sc - dc;
        const aR = er, aC = ec;
        const beforeOpen = bR >= 0 && bR < BOARD_SIZE && bC >= 0 && bC < BOARD_SIZE && board[bR][bC] === null;
        const afterOpen = aR >= 0 && aR < BOARD_SIZE && aC >= 0 && aC < BOARD_SIZE && board[aR][aC] === null;

        if (requireBothOpen) {
          if (beforeOpen && afterOpen) {
            spots.push({ row: bR, col: bC });
            spots.push({ row: aR, col: aC });
          }
        } else {
          if (beforeOpen && !afterOpen) spots.push({ row: bR, col: bC });
          else if (afterOpen && !beforeOpen) spots.push({ row: aR, col: aC });
          // If both open, it's actually an open-4, but return both as blocking options
          else if (beforeOpen && afterOpen) {
            spots.push({ row: bR, col: bC });
            spots.push({ row: aR, col: aC });
          }
        }
      }
    }
  }
  return spots;
}

// ─── Find gap positions in gapped-4 patterns (X_XXX, XX_XX, XXX_X) ──────────
function findGapBlocks(board, sym) {
  const spots = [];
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        let ok = true;
        const w5 = [];
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { ok = false; break; }
          w5.push({ val: board[nr][nc], r: nr, c: nc });
        }
        if (!ok) continue;
        let sc5 = 0, gaps = 0, gapIdx = -1, oc5 = 0;
        for (let i = 0; i < 5; i++) {
          if (w5[i].val === sym) sc5++;
          else if (w5[i].val === null) { gaps++; gapIdx = i; }
          else oc5++;
        }
        if (sc5 === 4 && gaps === 1 && oc5 === 0) {
          spots.push({ row: w5[gapIdx].r, col: w5[gapIdx].c });
        }
      }
    }
  }
  return spots;
}

// ─── Window-of-5 evaluation (used inside minimax) ────────────────────────────
function scoreWindow(cells, symbol) {
  let mine = 0, opp_cnt = 0;
  for (const c of cells) {
    if (c === symbol) mine++;
    else if (c !== null) opp_cnt++;
  }
  if (opp_cnt > 0) return 0;
  switch (mine) {
    case 5: return WIN_SCORE;
    case 4: return 200_000;
    case 3: return   8_000;
    case 2: return     120;
    case 1: return       5;
    default: return      0;
  }
}

function evaluateBoard(board, symbol) {
  let score = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cells = []; let ok = true;
        for (let i = 0; i < 5; i++) {
          const nr = r+dr*i, nc = c+dc*i;
          if (nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE) { ok=false; break; }
          cells.push(board[nr][nc]);
        }
        if (ok) score += scoreWindow(cells, symbol);
      }
    }
  }
  return score;
}

// ─── Candidate moves: expand ±2 from any placed piece ────────────────────────
function getCandidates(board, aiSym, humanSym, maxCount = 15) {
  const seen = new Set();
  let hasAny = false;
  for (let r=0;r<BOARD_SIZE;r++)
    for (let c=0;c<BOARD_SIZE;c++) {
      if (board[r][c]===null) continue;
      hasAny = true;
      for (let dr=-2;dr<=2;dr++)
        for (let dc=-2;dc<=2;dc++) {
          const nr=r+dr, nc=c+dc;
          if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc]===null)
            seen.add(nr*BOARD_SIZE+nc);
        }
    }
  if (!hasAny) { const ct=Math.floor(BOARD_SIZE/2); return [{row:ct,col:ct}]; }

  // Fast proximity-based scoring (no evaluateBoard calls)
  const scored = [...seen].map(key => {
    const row=Math.floor(key/BOARD_SIZE), col=key%BOARD_SIZE;
    let score = 0;
    // Check all 4 directions for line potential
    for (const [dr, dc] of DIRS) {
      let aiCount = 0, humCount = 0, aiConsec = 0, humConsec = 0;
      for (let d = -4; d <= 4; d++) {
        if (d === 0) continue;
        const r = row + dr * d, c = col + dc * d;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
        const v = board[r][c];
        if (v === aiSym) { aiCount++; if (Math.abs(d) <= 2) aiConsec++; }
        else if (v === humanSym) { humCount++; if (Math.abs(d) <= 2) humConsec++; }
      }
      // Offensive + defensive value
      score += aiConsec * aiConsec * 100 + aiCount * 20;
      score += humConsec * humConsec * 150 + humCount * 30; // Defensive slightly higher
    }
    // Center bonus
    const distCenter = Math.abs(row - BOARD_SIZE/2) + Math.abs(col - BOARD_SIZE/2);
    score += Math.max(0, 20 - distCenter) * 5;
    return { row, col, score };
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0, maxCount);
}

// ─── Minimax + Alpha-Beta (depth 5) ──────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym))
    return isMaximizing ? -WIN_SCORE-depth : WIN_SCORE+depth;
  if (depth === 0) {
    const aiS  = evaluateBoard(board, aiSym);
    const humS = evaluateBoard(board, humanSym);
    return aiS - humS * 2.5;  // Very strong defensive weighting
  }
  const candidates = getCandidates(board, aiSym, humanSym, 6);
  if (candidates.length === 0) return 0;
  if (isMaximizing) {
    let best = -Infinity;
    for (const {row,col} of candidates) {
      board[row][col] = aiSym;
      const s = minimax(board, depth-1, alpha, beta, false, aiSym, humanSym, {row,col});
      board[row][col] = null;
      best = Math.max(best, s); alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const {row,col} of candidates) {
      board[row][col] = humanSym;
      const s = minimax(board, depth-1, alpha, beta, true, aiSym, humanSym, {row,col});
      board[row][col] = null;
      best = Math.min(best, s); beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Find best blocking move against a fork ───────────────────────────────────
function findBestBlock(board, sym, candidates) {
  // Among candidates, find the one that MOST reduces opponent threats
  // while also checking if any candidate creates a fork threat themselves
  const opp = sym === 'X' ? 'O' : 'X';
  let best = null, bestScore = -Infinity;
  for (const {row, col} of candidates) {
    board[row][col] = opp;  // AI blocks here
    const tAfter = fastThreatsAt(board, row, col, sym);
    board[row][col] = null;
    // Score: how much does placing AI here reduce human threats?
    const s = -(tAfter.open4 * 100000 + tAfter.broken4 * 10000 + tAfter.open3 * 1000 + tAfter.broken3 * 100);
    // Bonus: does this move also create AI threats?
    board[row][col] = opp;
    const aiT = fastThreatsAt(board, row, col, opp);
    board[row][col] = null;
    const bonus = aiT.broken4 * 5000 + aiT.open3 * 500;
    if (s + bonus > bestScore) { bestScore = s + bonus; best = {row, col}; }
  }
  return best;
}

// ─── Hard mode: Threat-5 engine ───────────────────────────────────────────────
function computeHardMove(board, aiSym, humanSym, candidates, humanMoves) {
  // Get full threat landscape BEFORE any move
  const hT = classifyThreats(board, humanSym);
  const aT = classifyThreats(board, aiSym);

  // ── Priority 1: AI wins immediately ───────────────────────────────────────
  for (const {row,col} of candidates) {
    board[row][col] = aiSym;
    if (checkWin(board, row, col, aiSym)) { board[row][col] = null; return {row,col}; }
    board[row][col] = null;
  }

  // ── Priority 2: Block human immediate win ─────────────────────────────────
  for (const {row,col} of candidates) {
    board[row][col] = humanSym;
    if (checkWin(board, row, col, humanSym)) { board[row][col] = null; return {row,col}; }
    board[row][col] = null;
  }

  // ── Priority 3: Block human open-4 (_XXXX_) — find the blocking spots directly ─
  if (hT.open4 >= 1) {
    const blockSpots = findLineEndBlocks(board, humanSym, 4, true);
    if (blockSpots.length > 0) {
      // Pick the block that also creates best AI threat
      let best = blockSpots[0], bestB = -1;
      for (const {row,col} of blockSpots) {
        board[row][col] = aiSym;
        const t = fastThreatsAt(board, row, col, aiSym);
        board[row][col] = null;
        const b = t.broken4 * 1000 + t.open3 * 100;
        if (b > bestB) { bestB = b; best = {row,col}; }
      }
      return best;
    }
  }

  // ── Priority 4: AI creates open-4 or double broken-4 ──────────────────────
  for (const {row,col} of candidates) {
    board[row][col] = aiSym;
    const t = fastThreatsAt(board, row, col, aiSym);
    board[row][col] = null;
    if (t.open4 >= 1 || t.broken4 >= 2) return {row,col};
  }

  // ── Priority 5: Block human broken-4 (XXXX_, XX_XX, etc.) ────────────────
  if (hT.broken4 >= 1) {
    // For consecutive broken-4: find the one open end
    const blockSpots = findLineEndBlocks(board, humanSym, 4, false);
    if (blockSpots.length > 0) return blockSpots[0];
    // For gapped broken-4 (X_XXX, XX_XX, XXX_X): find the gap
    const gapSpots = findGapBlocks(board, humanSym);
    if (gapSpots.length > 0) return gapSpots[0];
  }

  // ── Priority 6: Block human fork (≥2 simultaneous threats) ────────────────
  const humanForkMoves = candidates.filter(({row,col}) => moveCreatesFork(board, row, col, humanSym));
  if (humanForkMoves.length > 0) {
    // Try to create AI broken-4 while blocking the fork
    for (const {row,col} of humanForkMoves) {
      board[row][col] = aiSym;
      const aiAfter = fastThreatsAt(board, row, col, aiSym);
      board[row][col] = null;
      if (aiAfter.broken4 >= 1) return {row,col};
    }
    // Otherwise pick the blocking move that reduces the most human threats
    return findBestBlock(board, humanSym, humanForkMoves) || humanForkMoves[0];
  }

  // ── Priority 7: AI creates a fork ─────────────────────────────────────────
  const aiForkMoves = candidates.filter(({row,col}) => moveCreatesFork(board, row, col, aiSym));
  if (aiForkMoves.length > 0) {
    return aiForkMoves[0];
  }

  // ── Priority 8: AI creates a single broken-4 (XXXX_) ─────────────────────
  // Only attack when human has no immediate fork threat
  for (const {row,col} of candidates) {
    board[row][col] = aiSym;
    const t = fastThreatsAt(board, row, col, aiSym);
    board[row][col] = null;
    if (t.broken4 >= 1) return {row,col};
  }

  // ── Priority 9: Block human open-3 threats aggressively ─────────────────
  if (hT.open3 >= 1) {
    let best = null, bS = -Infinity;
    for (const {row,col} of candidates) {
      board[row][col] = aiSym;
      // Use fast scanner instead of full classifyThreats
      const hAfter = fastThreatsAt(board, row, col, humanSym);
      const aiAfter = fastThreatsAt(board, row, col, aiSym);
      board[row][col] = null;
      const s = -hAfter.open3 * 5000 - hAfter.broken4 * 15000
              + aiAfter.broken4 * 3000 + aiAfter.open3 * 800;
      if (s > bS) { bS = s; best = {row,col}; }
    }
    if (best) return best;
  }

  // ── Priority 10: ML-boosted minimax ─────────────────────────────────────
  const w = ml.mlWeight;
  const pool = candidates.slice(0, 5); // small pool, depth-3 is fast + strong

  const scored = pool.map(({row, col}) => {
    board[row][col] = aiSym;
    const mmScore = minimax(board, 3, -Infinity, Infinity, false, aiSym, humanSym, {row,col});
    board[row][col] = null;
    const mlBias = w > 0 ? ml.getBias(board, row, col, aiSym) * w * 100_000 : 0;
    return { row, col, total: mmScore + mlBias };
  });
  scored.sort((a, b) => b.total - a.total);

  if (ml.isExploitedOpening(humanMoves) && scored.length >= 2) {
    const topK = scored.slice(0, 2);
    return topK[Math.floor(Math.random() * topK.length)];
  }

  return scored[0] || candidates[0];
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = function({ data }) {

  if (data.type === 'init') {
    ml = new MLEngine(data.mlData || {});
    return;
  }

  if (data.type === 'learn') {
    ml.learn(data.result, data.openingKey || '');
    self.postMessage({ type: 'mlUpdate', mlData: ml.serialize() });
    return;
  }

  const { board, aiSymbol, difficulty } = data;
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const humanMoves  = data.humanMoves || [];

  // ── Opening shortcut: if ≤1 piece on board, no need for heavy computation ──
  const piecesOnBoard = board.flat().filter(v => v !== null).length;
  if (piecesOnBoard === 0) {
    const ct = Math.floor(BOARD_SIZE / 2);
    self.postMessage({ row: ct, col: ct }); return;
  }
  if (piecesOnBoard === 1) {
    // Find the one piece and play adjacent
    let pr = -1, pc = -1;
    outer: for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (board[r][c] !== null) { pr = r; pc = c; break outer; }
    const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const choices = offsets
      .map(([dr,dc]) => ({ row: pr+dr, col: pc+dc }))
      .filter(({row,col}) => row>=0&&row<BOARD_SIZE&&col>=0&&col<BOARD_SIZE&&board[row][col]===null);
    const pick = choices[Math.floor(Math.random() * choices.length)] || { row: pr, col: pc+1 };
    self.postMessage(pick); return;
  }
  // With ≤3 pieces, no real threats exist → fast path
  if (piecesOnBoard <= 3) {
    const earlyCands = getCandidates(board, aiSymbol, humanSymbol, 10);
    // Still check for immediate win/block even in early game
    for (const {row,col} of earlyCands) {
      board[row][col] = aiSymbol;
      if (checkWin(board,row,col,aiSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col] = null;
    }
    for (const {row,col} of earlyCands) {
      board[row][col] = humanSymbol;
      if (checkWin(board,row,col,humanSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col] = null;
    }
    self.postMessage(earlyCands[0]); return;
  }

  const candidates  = getCandidates(board, aiSymbol, humanSymbol, 20);


  // EASY ──────────────────────────────────────────────────────────────────────
  if (difficulty === 'easy') {
    for (const {row,col} of candidates) {
      board[row][col]=aiSymbol;
      if (checkWin(board,row,col,aiSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col]=null;
    }
    for (const {row,col} of candidates) {
      board[row][col]=humanSymbol;
      if (checkWin(board,row,col,humanSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col]=null;
    }
    if (Math.random()<0.55) {
      const topN=candidates.slice(0,Math.min(10,candidates.length));
      self.postMessage(topN[Math.floor(Math.random()*topN.length)]); return;
    }
    let bS=-Infinity, bM=candidates[0];
    for (const {row,col} of candidates.slice(0,10)) {
      board[row][col]=aiSymbol;
      const s=minimax(board,0,-Infinity,Infinity,false,aiSymbol,humanSymbol,{row,col});
      board[row][col]=null;
      if (s>bS) { bS=s; bM={row,col}; }
    }
    self.postMessage(bM); return;
  }

  // MEDIUM ────────────────────────────────────────────────────────────────────
  if (difficulty === 'medium') {
    for (const {row,col} of candidates) {
      board[row][col]=aiSymbol;
      if (checkWin(board,row,col,aiSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col]=null;
    }
    for (const {row,col} of candidates) {
      board[row][col]=humanSymbol;
      if (checkWin(board,row,col,humanSymbol)) { board[row][col]=null; self.postMessage({row,col}); return; }
      board[row][col]=null;
    }
    // Block human win4
    const hBaseM = classifyThreats(board, humanSymbol);
    if (hBaseM.broken4 >= 1) {
      for (const {row,col} of candidates) {
        board[row][col]=aiSymbol;
        const after = classifyThreats(board, humanSymbol);
        board[row][col]=null;
        if (after.broken4 < hBaseM.broken4) { self.postMessage({row,col}); return; }
      }
    }
    if (hBaseM.open3 >= 1) {
      let best=null, bS2=-Infinity;
      for (const {row,col} of candidates) {
        board[row][col]=aiSymbol;
        const hA=classifyThreats(board,humanSymbol); board[row][col]=null;
        const s=(hBaseM.open3-hA.open3)*1000+(hBaseM.broken4-hA.broken4)*5000;
        if (s>bS2) { bS2=s; best={row,col}; }
      }
      if (best&&bS2>0) { self.postMessage(best); return; }
    }
    let bScore=-Infinity, bMove=candidates[0];
    for (const {row,col} of candidates.slice(0,15)) {
      board[row][col]=aiSymbol;
      const s=minimax(board,2,-Infinity,Infinity,false,aiSymbol,humanSymbol,{row,col});
      board[row][col]=null;
      if (s>bScore) { bScore=s; bMove={row,col}; }
    }
    self.postMessage(bMove); return;
  }

  // HARD: Threat-5 engine ─────────────────────────────────────────────────────
  const move = computeHardMove(board, aiSymbol, humanSymbol, candidates, humanMoves);
  ml.recordMove(board, move.row, move.col, aiSymbol);
  self.postMessage(move);
};
