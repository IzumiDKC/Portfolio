// ai-worker.js – Web Worker AI for Caro (Gomoku 5-in-a-row)
// Uses window-based evaluation + Q-Learning pattern memory (Hard mode only)

const BOARD_SIZE = 20;
const WIN_SCORE  = 10_000_000;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

// ─── MLEngine: Pattern-based Q-Learning ───────────────────────────────────────
const MAX_QTABLE = 6000;   // max Q-table entries kept in memory
const OPENING_K  = 3;      // first K human moves define an "opening"

class MLEngine {
  constructor(data = {}) {
    this.qTable       = data.qTable       || {};
    this.openingStats = data.openingStats || {};
    this.gamesPlayed  = data.gamesPlayed  || 0;
    this.gameTrace    = []; // pattern hashes of AI moves in current game
  }

  // 5×5 local pattern hash around (row, col). Encodes aiSym as 'A', opponent as 'H'
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

  // Q-value bias for a candidate AI move (in range [-1, 1])
  getBias(board, row, col, aiSym) {
    return this.qTable[this.patternHash(board, row, col, aiSym)] || 0;
  }

  // Record that AI played (row, col) — called after each hard-mode move
  recordMove(board, row, col, aiSym) {
    this.gameTrace.push(this.patternHash(board, row, col, aiSym));
  }

  // Backward-propagate reward through the game trace using eligibility traces
  learn(result, openingKey) {
    // Stronger penalty for losing (-2.5), bigger win reward (1.5)
    const reward = result === 'win' ? 1.5 : result === 'lose' ? -2.5 : 0.1;
    const alpha = 0.4, gamma = 0.85;
    let disc = reward;
    for (let i = this.gameTrace.length - 1; i >= 0; i--) {
      const h = this.gameTrace[i];
      const q = this.qTable[h] || 0;
      this.qTable[h] = Math.max(-1, Math.min(1, q + alpha * (disc - q)));
      disc *= gamma;
    }
    // Track opening stats for adaptive disruption
    if (openingKey) {
      if (!this.openingStats[openingKey])
        this.openingStats[openingKey] = { count: 0, humanWins: 0 };
      this.openingStats[openingKey].count++;
      if (result === 'lose') this.openingStats[openingKey].humanWins++;
    }
    this.gamesPlayed++;
    this.gameTrace = [];
  }

  // Returns true when human repeatedly wins with same opening (≥1 game with ≥50% win rate)
  isExploitedOpening(humanMoves) {
    if (humanMoves.length < OPENING_K) return false;
    const key = humanMoves.slice(0, OPENING_K).join('|');
    const s = this.openingStats[key];
    return s && s.count >= 1 && (s.humanWins / s.count) >= 0.5;
  }

  // ML weight: strong from game 1, grows further with experience
  get mlWeight() {
    if (this.gamesPlayed === 0) return 0.8;  // strong from the very first game
    if (this.gamesPlayed < 5)  return 0.9;
    if (this.gamesPlayed < 20) return 1.0;
    return 1.5;
  }

  // Prune Q-table to MAX_QTABLE entries and serialize
  serialize() {
    const pruned = Object.fromEntries(
      Object.entries(this.qTable)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, MAX_QTABLE)
    );
    return { qTable: pruned, openingStats: this.openingStats, gamesPlayed: this.gamesPlayed };
  }
}

// Global ML engine instance (lives for the lifetime of the worker)
let ml = new MLEngine();

// ─── Window-of-5 evaluation ──────────────────────────────────────────────────
function scoreWindow(cells, symbol) {
  let mine = 0, opp_cnt = 0;
  for (const c of cells) {
    if (c === symbol) mine++;
    else if (c !== null) opp_cnt++;
  }
  if (opp_cnt > 0) return 0;
  switch (mine) {
    case 5: return WIN_SCORE;
    case 4: return 150_000;
    case 3: return   5_000;
    case 2: return     100;
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

// ─── Window threat counter (detects ALL gap patterns) ────────────────────────
function countWindowThreats(board, symbol) {
  let win4 = 0, open3 = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        let mine=0, opp_cnt=0, ok=true;
        for (let i=0;i<5;i++) {
          const nr=r+dr*i, nc=c+dc*i;
          if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE){ok=false;break;}
          const cell=board[nr][nc];
          if(cell===symbol)mine++;
          else if(cell!==null)opp_cnt++;
        }
        if(!ok||opp_cnt>0) continue;
        if(mine===4) win4++;
        else if(mine===3) open3++;
      }
    }
  }
  return { win4, open3 };
}

// ─── Candidate moves ─────────────────────────────────────────────────────────
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

  const scored = [...seen].map(key => {
    const row=Math.floor(key/BOARD_SIZE), col=key%BOARD_SIZE;
    board[row][col]=aiSym;  const aiScore=evaluateBoard(board,aiSym);
    board[row][col]=humanSym; const humScore=evaluateBoard(board,humanSym);
    board[row][col]=null;
    return { row, col, score: aiScore + humScore*1.5 };
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0, maxCount);
}

// ─── Minimax + Alpha-Beta ─────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym))
    return isMaximizing ? -WIN_SCORE-depth : WIN_SCORE+depth;
  if (depth===0) return evaluateBoard(board,aiSym) - evaluateBoard(board,humanSym)*1.5;
  const candidates = getCandidates(board, aiSym, humanSym, 10);
  if (candidates.length===0) return 0;
  if (isMaximizing) {
    let best=-Infinity;
    for (const {row,col} of candidates) {
      board[row][col]=aiSym;
      const s=minimax(board,depth-1,alpha,beta,false,aiSym,humanSym,{row,col});
      board[row][col]=null;
      best=Math.max(best,s); alpha=Math.max(alpha,best);
      if (beta<=alpha) break;
    }
    return best;
  } else {
    let best=Infinity;
    for (const {row,col} of candidates) {
      board[row][col]=humanSym;
      const s=minimax(board,depth-1,alpha,beta,true,aiSym,humanSym,{row,col});
      board[row][col]=null;
      best=Math.min(best,s); beta=Math.min(beta,best);
      if (beta<=alpha) break;
    }
    return best;
  }
}

// ─── Real fork detector ───────────────────────────────────────────────────────
function findRealFork(board, sym, candidates) {
  let best=null, bestScore=0;
  for (const {row,col} of candidates) {
    board[row][col]=sym;
    const t=countWindowThreats(board,sym);
    board[row][col]=null;
    if (t.win4>=2||(t.win4>=1&&t.open3>=2)||t.open3>=3) {
      const score=t.win4*100+t.open3;
      if (score>bestScore) { bestScore=score; best={row,col}; }
    }
  }
  return best;
}

// ─── Detect open-ended threats: _XXXX_ and _XXX_ patterns ────────────────────
// countWindowThreats uses strict 5-window; this catches open-ended sequences
function detectOpenEndedThreats(board, sym) {
  let open4 = 0, open3 = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cells = [];
        let ok = true;
        for (let i = 0; i < 6; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { ok = false; break; }
          cells.push(board[nr][nc]);
        }
        if (!ok) continue;
        // _XXXX_ — 4 in a row, both ends open
        if (cells[0] === null && cells[5] === null) {
          const mid = cells.slice(1, 5);
          if (mid.every(v => v === sym)) open4++;
          const symCount = mid.filter(v => v === sym).length;
          if (symCount === 3 && mid.filter(v => v === null).length === 1) open3++;
        }
      }
    }
  }
  return { open4, open3 };
}

// ─── Hard mode: threat-space + ML-guided minimax ──────────────────────────────
function computeHardMove(board, aiSym, humanSym, candidates, humanMoves) {
  // ── Priority rules 1-7 (absolute, unchanged) ──────────────────────────────

  // 1. Win immediately
  for (const {row,col} of candidates) {
    board[row][col]=aiSym;
    if (checkWin(board,row,col,aiSym)) { board[row][col]=null; return {row,col}; }
    board[row][col]=null;
  }
  // 2. Block immediate loss
  for (const {row,col} of candidates) {
    board[row][col]=humanSym;
    if (checkWin(board,row,col,humanSym)) { board[row][col]=null; return {row,col}; }
    board[row][col]=null;
  }
  // 3. Create win4 window
  for (const {row,col} of candidates) {
    board[row][col]=aiSym;
    const t=countWindowThreats(board,aiSym); board[row][col]=null;
    if (t.win4>=1) return {row,col};
  }
  // 4. Block human win4 window (catches XX_XX, XXXX_ etc.)
  for (const {row,col} of candidates) {
    board[row][col]=humanSym;
    const t=countWindowThreats(board,humanSym); board[row][col]=null;
    if (t.win4>=1) return {row,col};
  }
  // 5. Create real fork
  const aiFork=findRealFork(board,aiSym,candidates);
  if (aiFork) {
    const hCur=countWindowThreats(board,humanSym);
    if (hCur.win4===0&&hCur.open3<2) return aiFork;
  }
  // 4.5: Block human open-ended _XXXX_ (open-4) — highest urgency after win4
  const hOpenBase = detectOpenEndedThreats(board, humanSym);
  if (hOpenBase.open4 >= 1) {
    let best=null, bS=-Infinity;
    for (const {row,col} of candidates) {
      board[row][col]=aiSym;
      const after = detectOpenEndedThreats(board, humanSym);
      board[row][col]=null;
      const s = (hOpenBase.open4 - after.open4) * 20000 + (hOpenBase.open3 - after.open3) * 3000;
      if (s > bS) { bS=s; best={row,col}; }
    }
    if (best && bS > 0) return best;
  }
  // 6. Block human real fork
  const humanFork=findRealFork(board,humanSym,candidates);
  if (humanFork) return humanFork;
  // 7. Block human open3 threats
  const hBase=countWindowThreats(board,humanSym);
  if (hBase.open3>=1) {
    let best=null, bS=-Infinity;
    for (const {row,col} of candidates) {
      board[row][col]=aiSym;
      const hA=countWindowThreats(board,humanSym);
      const aiA=countWindowThreats(board,aiSym);
      board[row][col]=null;
      const s=(hBase.open3-hA.open3)*2000+(hBase.win4-hA.win4)*8000+aiA.win4*3000+aiA.open3*300;
      if (s>bS) { bS=s; best={row,col}; }
    }
    if (best&&bS>0) return best;
  }

  // ── Step 8: ML-boosted minimax (adaptive, depth=4 for maximum strength) ──
  const w = ml.mlWeight;
  const pool = candidates.slice(0, 10); // tight pool → depth-4 search stays fast

  // Score every candidate: minimax depth 4 + ML bias
  const scored = pool.map(({row, col}) => {
    board[row][col] = aiSym;
    const mmScore = minimax(board, 4, -Infinity, Infinity, false, aiSym, humanSym, {row,col});
    board[row][col] = null;
    const mlBias = w > 0 ? ml.getBias(board, row, col, aiSym) * w * 80_000 : 0;
    return { row, col, total: mmScore + mlBias };
  });
  scored.sort((a, b) => b.total - a.total);

  // Adaptive disruption: if human wins with same opening,
  // randomize among top-2 to break AI predictability (activated after 1 game)
  if (ml.isExploitedOpening(humanMoves) && scored.length >= 2) {
    const topK = scored.slice(0, Math.min(2, scored.length));
    return topK[Math.floor(Math.random() * topK.length)];
  }

  return scored[0] || candidates[0];
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = function({ data }) {

  // ── ML: Initialize engine with stored data ───────────────────────────────
  if (data.type === 'init') {
    ml = new MLEngine(data.mlData || {});
    return;
  }

  // ── ML: Learn from completed game, send back updated data ────────────────
  if (data.type === 'learn') {
    ml.learn(data.result, data.openingKey || '');
    self.postMessage({ type: 'mlUpdate', mlData: ml.serialize() });
    return;
  }

  // ── Get best move ─────────────────────────────────────────────────────────
  const { board, aiSymbol, difficulty } = data;
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const humanMoves  = data.humanMoves || [];
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
    for (const {row,col} of candidates) {
      board[row][col]=aiSymbol; const hA=countWindowThreats(board,humanSymbol); board[row][col]=null;
      board[row][col]=humanSymbol; const hB=countWindowThreats(board,humanSymbol); board[row][col]=null;
      if (hB.win4>hA.win4) { self.postMessage({row,col}); return; }
    }
    const hBase2=countWindowThreats(board,humanSymbol);
    if (hBase2.open3>=1) {
      let best=null, bS2=-Infinity;
      for (const {row,col} of candidates) {
        board[row][col]=aiSymbol;
        const hA=countWindowThreats(board,humanSymbol); board[row][col]=null;
        const s=(hBase2.open3-hA.open3)*1000+(hBase2.win4-hA.win4)*5000;
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

  // HARD: full threat-space search + ML-guided adaptive minimax ───────────────
  const move = computeHardMove(board, aiSymbol, humanSymbol, candidates, humanMoves);
  ml.recordMove(board, move.row, move.col, aiSymbol); // record for end-of-game learning
  self.postMessage(move);
};
