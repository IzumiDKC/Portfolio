import { BOARD_SIZE } from './constants.js';

const WIN_SCORE = 10_000_000;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

// ─── Window-of-5 evaluation ──────────────────────────────────────────────────
// Detects ALL patterns including gaps: XX_XX counted same as XXXX_
function scoreWindow(cells, symbol) {
  const opp = symbol === 'X' ? 'O' : 'X';
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
        const cells = [];
        let ok = true;
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
export function checkWin(board, row, col, symbol) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let d=1;d<5;d++){const r=row+dr*d,c=col+dc*d;if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol)break;count++;}
    for (let d=1;d<5;d++){const r=row-dr*d,c=col-dc*d;if(r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==symbol)break;count++;}
    if (count >= 5) return true;
  }
  return false;
}

// ─── Window-based threat counter (detects ALL gap patterns) ──────────────────
function countWindowThreats(board, symbol) {
  let win4 = 0, open3 = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        let mine = 0, opp_cnt = 0, ok = true;
        for (let i = 0; i < 5; i++) {
          const nr=r+dr*i, nc=c+dc*i;
          if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE){ok=false;break;}
          const cell=board[nr][nc];
          if(cell===symbol)mine++;
          else if(cell!==null)opp_cnt++;
        }
        if(!ok||opp_cnt>0)continue;
        if(mine===4)win4++;
        else if(mine===3)open3++;
      }
    }
  }
  return { win4, open3 };
}

// ─── Candidate moves ─────────────────────────────────────────────────────────
function getCandidates(board, aiSym, humanSym, maxCount = 15) {
  const seen = new Set();
  let hasAny = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) continue;
      hasAny = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr=r+dr, nc=c+dc;
          if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc]===null)
            seen.add(nr*BOARD_SIZE+nc);
        }
      }
    }
  }
  if (!hasAny) {
    const center = Math.floor(BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }
  const scored = [...seen].map(key => {
    const row = Math.floor(key/BOARD_SIZE), col = key%BOARD_SIZE;
    board[row][col] = aiSym;
    const aiScore = evaluateBoard(board, aiSym);
    board[row][col] = humanSym;
    const humScore = evaluateBoard(board, humanSym);
    board[row][col] = null;
    return { row, col, score: aiScore + humScore * 1.5 };
  });
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

// ─── Minimax + Alpha-Beta ─────────────────────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) return evaluateBoard(board, aiSym) - evaluateBoard(board, humanSym) * 1.5;

  const candidates = getCandidates(board, aiSym, humanSym, 10);
  if (candidates.length === 0) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSym;
      const s = minimax(board, depth-1, alpha, beta, false, aiSym, humanSym, { row, col });
      board[row][col] = null;
      best = Math.max(best, s); alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = humanSym;
      const s = minimax(board, depth-1, alpha, beta, true, aiSym, humanSym, { row, col });
      board[row][col] = null;
      best = Math.min(best, s); beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Real fork detector ───────────────────────────────────────────────────────
function findRealFork(board, sym, candidates) {
  let best = null, bestScore = 0;
  for (const { row, col } of candidates) {
    board[row][col] = sym;
    const t = countWindowThreats(board, sym);
    board[row][col] = null;
    if (t.win4 >= 2 || (t.win4 >= 1 && t.open3 >= 2) || t.open3 >= 3) {
      const score = t.win4 * 100 + t.open3;
      if (score > bestScore) { bestScore = score; best = { row, col }; }
    }
  }
  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function getBestMove(board, aiSymbol, difficulty = 'hard') {
  const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const candidates = getCandidates(board, aiSymbol, humanSymbol, 20);

  // EASY
  if (difficulty === 'easy') {
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    if (Math.random() < 0.55) {
      const topN = candidates.slice(0, Math.min(10, candidates.length));
      return topN[Math.floor(Math.random() * topN.length)];
    }
    let bS = -Infinity, bM = candidates[0];
    for (const { row, col } of candidates.slice(0, 10)) {
      board[row][col] = aiSymbol;
      const s = minimax(board, 0, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (s > bS) { bS = s; bM = { row, col }; }
    }
    return bM;
  }

  // MEDIUM
  if (difficulty === 'medium') {
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
      board[row][col] = null;
    }
    // Block win4 windows
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      const t = countWindowThreats(board, humanSymbol);
      board[row][col] = null;
      if (t.win4 >= 1) { return { row, col }; }
    }
    // Block open3 windows
    const hBase = countWindowThreats(board, humanSymbol);
    if (hBase.open3 >= 1) {
      let best = null, bS = -Infinity;
      for (const { row, col } of candidates) {
        board[row][col] = aiSymbol;
        const hA = countWindowThreats(board, humanSymbol);
        board[row][col] = null;
        const s = (hBase.open3-hA.open3)*1000 + (hBase.win4-hA.win4)*5000;
        if (s > bS) { bS = s; best = { row, col }; }
      }
      if (best && bS > 0) return best;
    }
    let bScore = -Infinity, bMove = candidates[0];
    for (const { row, col } of candidates.slice(0, 15)) {
      board[row][col] = aiSymbol;
      const s = minimax(board, 2, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
      board[row][col] = null;
      if (s > bScore) { bScore = s; bMove = { row, col }; }
    }
    return bMove;
  }

  // HARD
  // 1. Win immediately
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    if (checkWin(board, row, col, aiSymbol)) { board[row][col] = null; return { row, col }; }
    board[row][col] = null;
  }
  // 2. Block immediate loss
  for (const { row, col } of candidates) {
    board[row][col] = humanSymbol;
    if (checkWin(board, row, col, humanSymbol)) { board[row][col] = null; return { row, col }; }
    board[row][col] = null;
  }
  // 3. Create win4 window
  for (const { row, col } of candidates) {
    board[row][col] = aiSymbol;
    const t = countWindowThreats(board, aiSymbol);
    board[row][col] = null;
    if (t.win4 >= 1) return { row, col };
  }
  // 4. Block human win4 window (all gap patterns)
  for (const { row, col } of candidates) {
    board[row][col] = humanSymbol;
    const t = countWindowThreats(board, humanSymbol);
    board[row][col] = null;
    if (t.win4 >= 1) return { row, col };
  }
  // 5. Create real fork
  const aiFork = findRealFork(board, aiSymbol, candidates);
  if (aiFork) {
    const hCurrent = countWindowThreats(board, humanSymbol);
    if (hCurrent.win4 === 0 && hCurrent.open3 < 2) return aiFork;
  }
  // 6. Block human's real fork
  const humanFork = findRealFork(board, humanSymbol, candidates);
  if (humanFork) return humanFork;
  // 7. Block human open3
  const hBase = countWindowThreats(board, humanSymbol);
  if (hBase.open3 >= 1) {
    let best = null, bS = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      const hA = countWindowThreats(board, humanSymbol);
      const aiA = countWindowThreats(board, aiSymbol);
      board[row][col] = null;
      const s = (hBase.open3-hA.open3)*2000 + (hBase.win4-hA.win4)*8000 + aiA.win4*3000 + aiA.open3*300;
      if (s > bS) { bS = s; best = { row, col }; }
    }
    if (best && bS > 0) return best;
  }
  // 8. Minimax depth 4
  let bScore = -Infinity, bMove = candidates[0];
  for (const { row, col } of candidates.slice(0, 15)) {
    board[row][col] = aiSymbol;
    const s = minimax(board, 3, -Infinity, Infinity, false, aiSymbol, humanSymbol, { row, col });
    board[row][col] = null;
    if (s > bScore) { bScore = s; bMove = { row, col }; }
  }
  return bMove;
}
