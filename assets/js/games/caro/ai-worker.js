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

// ─── Comprehensive Threat Classifier ─────────────────────────────────────────
// Scans every line of length 6 and classifies the threat level for `sym`.
// Returns: { five, open4, broken4, open3, broken3 }
//   five    = 5+ in a row (win)
//   open4   = _XXXX_ (unstoppable unless blocked at one end)
//   broken4 = XXXX_ or _XXXX or XX_XX or X_XXX or XXX_X (4 in line, 1 gap/blocked-end)
//   open3   = _XXX_ (double-open 3)
//   broken3 = _XX_X_ or similar (3 with one end or gap)
function classifyThreats(board, sym) {
  const opp = sym === 'X' ? 'O' : 'X';
  let five = 0, open4 = 0, broken4 = 0, open3 = 0, broken3 = 0;

  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {

        // Scan window of 6 for open-ended threats
        const w6 = [];
        let ok6 = true;
        for (let i = 0; i < 6; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { ok6 = false; break; }
          w6.push(board[nr][nc]);
        }
        if (ok6) {
          const symC = w6.filter(v => v === sym).length;
          const oppC = w6.filter(v => v === opp).length;
          if (oppC === 0) {
            const empC = w6.filter(v => v === null).length;
            // Open patterns: both ends of the 6-window are empty
            const leftOpen  = w6[0] === null;
            const rightOpen = w6[5] === null;
            if (leftOpen && rightOpen) {
              const inner = w6.slice(1, 5);
              const innerSym = inner.filter(v => v === sym).length;
              const innerEmp = inner.filter(v => v === null).length;
              if (innerSym === 4 && innerEmp === 0) open4++;       // _XXXX_
              else if (innerSym === 3 && innerEmp === 1) open3++;   // _X_XX_ etc
            }
          }
        }

        // Scan window of 5 for broken threats
        const w5 = [];
        let ok5 = true;
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { ok5 = false; break; }
          w5.push(board[nr][nc]);
        }
        if (ok5) {
          const symC5 = w5.filter(v => v === sym).length;
          const oppC5 = w5.filter(v => v === opp).length;
          if (oppC5 > 0) continue;
          if (symC5 === 5) five++;
          else if (symC5 === 4) broken4++;  // XXXX_ or _XXXX or XX_XX etc
          else if (symC5 === 3) broken3++;
        }
      }
    }
  }
  return { five, open4, broken4, open3, broken3 };
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

  // Score: heavily weight defensive value (human score × 2.5 instead of 1.5)
  const scored = [...seen].map(key => {
    const row=Math.floor(key/BOARD_SIZE), col=key%BOARD_SIZE;
    board[row][col]=aiSym;  const aiScore=evaluateBoard(board,aiSym);
    board[row][col]=humanSym; const humScore=evaluateBoard(board,humanSym);
    board[row][col]=null;
    return { row, col, score: aiScore + humScore * 2.5 };
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
  const candidates = getCandidates(board, aiSym, humanSym, 8);
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
    const tAfter = classifyThreats(board, sym);
    board[row][col] = null;
    // Score: how much does placing AI here reduce human threats?
    const s = -(tAfter.open4 * 100000 + tAfter.broken4 * 10000 + tAfter.open3 * 1000 + tAfter.broken3 * 100);
    // Bonus: does this move also create AI threats?
    board[row][col] = opp;
    const aiT = classifyThreats(board, opp);
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

  // ── Priority 3: Block human open-4 (_XXXX_) — always unstoppable next move ─
  if (hT.open4 >= 1) {
    let best = null, bS = -Infinity;
    for (const {row,col} of candidates) {
      board[row][col] = aiSym;
      const after = classifyThreats(board, humanSym);
      board[row][col] = null;
      const s = (hT.open4 - after.open4) * 500000 + (hT.broken4 - after.broken4) * 50000;
      if (s > bS) { bS = s; best = {row,col}; }
    }
    if (best) return best;
  }

  // ── Priority 4: AI creates open-4 or broken-4 ─────────────────────────────
  for (const {row,col} of candidates) {
    board[row][col] = aiSym;
    const t = classifyThreats(board, aiSym);
    board[row][col] = null;
    if (t.open4 >= 1 || t.broken4 >= 2) return {row,col};
  }

  // ── Priority 5: Block human broken-4 (XXXX_, XX_XX, etc.) ────────────────
  if (hT.broken4 >= 1) {
    for (const {row,col} of candidates) {
      board[row][col] = aiSym;
      const after = classifyThreats(board, humanSym);
      board[row][col] = null;
      // Must reduce broken4 count
      if (after.broken4 < hT.broken4 || after.open4 < hT.open4) return {row,col};
    }
  }

  // ── Priority 6: AI creates a single broken-4 (XXXX_) ─────────────────────
  for (const {row,col} of candidates) {
    board[row][col] = aiSym;
    const t = classifyThreats(board, aiSym);
    board[row][col] = null;
    if (t.broken4 >= 1) {
      // Check it doesn't leave human a fork or worse
      if (hT.open3 < 2 && hT.broken4 === 0) return {row,col};
    }
  }

  // ── Priority 7: Block human fork (≥2 simultaneous threats) ────────────
  const humanForkMoves = candidates.filter(({row,col}) => moveCreatesFork(board, row, col, humanSym));
  if (humanForkMoves.length > 0) {
    // If AI can create a broken4 while blocking, do that; otherwise block directly
    for (const {row,col} of humanForkMoves) {
      board[row][col] = aiSym;
      const aiAfter = classifyThreats(board, aiSym);
      board[row][col] = null;
      if (aiAfter.broken4 >= 1) return {row,col};
    }
    // Otherwise pick the blocking move that leaves fewest human threats
    return findBestBlock(board, humanSym, humanForkMoves) || humanForkMoves[0];
  }

  // ── Priority 8: AI creates a fork ─────────────────────────────────
  const aiForkMoves = candidates.filter(({row,col}) => moveCreatesFork(board, row, col, aiSym));
  if (aiForkMoves.length > 0 && hT.open3 < 1 && hT.broken4 === 0) {
    return aiForkMoves[0];
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
  // With ≤5 pieces, no real 3-in-a-row threats exist → skip classifyThreats/minimax
  // getCandidates already scores by (aiEval + humanEval×2.5), top-1 is safe & instant
  if (piecesOnBoard <= 5) {
    const earlyCands = getCandidates(board, aiSymbol, humanSymbol, 10);
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
