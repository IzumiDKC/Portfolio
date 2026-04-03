// ─────────────────────────────────────────────────────────────
//  Cờ Tướng AI – Web Worker (Minimax + Alpha-Beta Pruning)
//  Receives: { board, color, difficulty }
//  Returns:  { fromRow, fromCol, toRow, toCol }
// ─────────────────────────────────────────────────────────────

const ROWS = 10;
const COLS = 9;

// ── Piece values ──────────────────────────────────────────────
const PIECE_VALUE = { K: 100000, R: 1000, C: 500, N: 400, E: 200, A: 200, P: 100 };

// Positional tables (from Red's perspective, rows 0–9)
// Rows are flipped for black
const POS_TABLE = {
  R: [ // Rook – prefers center columns and advanced positions
    [206,208,207,213,214,213,207,208,206],
    [206,212,209,216,233,216,209,212,206],
    [206,208,207,214,216,214,207,208,206],
    [206,213,213,216,216,216,213,213,206],
    [208,211,211,214,215,214,211,211,208],
    [208,212,212,214,215,214,212,212,208],
    [206,208,207,213,214,213,207,208,206],
    [206,212,209,216,233,216,209,212,206],
    [206,208,207,214,216,214,207,208,206],
    [206,208,207,213,214,213,207,208,206]
  ],
  C: [ // Cannon – central mobility
    [100,100,96, 91,90, 91,96, 100,100],
    [98, 98, 96, 92,89, 92,96, 98, 98 ],
    [97, 97, 96, 91,92, 91,96, 97, 97 ],
    [96, 99, 99, 98,100,98, 99,99, 96 ],
    [96, 96, 96, 96,100,96, 96,96, 96 ],
    [95, 96, 99, 96,100,96, 99,96, 95 ],
    [96, 96, 96, 96,100,96, 96,96, 96 ],
    [97, 97, 96, 91,92, 91,96, 97, 97 ],
    [98, 98, 96, 92,89, 92,96, 98, 98 ],
    [100,100,96, 91,90, 91,96, 100,100]
  ],
  N: [ // Knight
    [90, 90, 90, 96,90, 96,90, 90,90 ],
    [90, 96,103, 97,94, 97,103,96, 90 ],
    [92, 98, 99,103,99, 103,99,98, 92 ],
    [93,108,100,107,100,107,100,108,93 ],
    [90,100, 99,103,104,103, 99,100,90 ],
    [90, 98, 101,102,103,102,101,98, 90 ],
    [92, 94, 98, 95, 98, 95, 98,94, 92 ],
    [93, 92, 92, 93, 92, 93, 92,92, 93 ],
    [85, 90, 92, 93, 78, 93, 92,90, 85 ],
    [88, 85, 90, 88, 90, 88, 90,85, 88 ]
  ],
  P: [ // Pawn – advances aggressively after crossing river
    [9,  9,  9, 11, 13, 11,  9,  9,  9],
    [19, 24, 34, 42, 44, 42, 34, 24, 19],
    [19, 24, 32, 37, 37, 37, 32, 24, 19],
    [19, 23, 27, 29, 30, 29, 27, 23, 19],
    [14, 18, 20, 27, 29, 27, 20, 18, 14],
    [7,   0, 13,  0, 16,  0, 13,  0,  7],
    [7,   0,  7,  0, 15,  0,  7,  0,  7],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0]
  ],
  E: [ // Elephant
    [0,   0,  20, 0,  0,  0,  20, 0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [18, 0,  0,  0,  23, 0,  0,  0,  18],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  20, 0,  0,  0,  20, 0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0]
  ],
  A: [ // Advisor
    [0,   0,  0,  20, 0,  20, 0,  0,  0],
    [0,   0,  0,  0,  23, 0,  0,  0,  0],
    [0,   0,  0,  20, 0,  20, 0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0],
    [0,   0,  0,  0,  0,  0,  0,  0,  0]
  ],
  K: [ // King – stay safe in palace, prefer center
    [0,   0,  0,  11, 15, 11, 0,  0,  0],
    [0,   0,  0,  2,   0,  2, 0,  0,  0],
    [0,   0,  0,  1,   0,  1, 0,  0,  0],
    [0,   0,  0,  0,   0,  0, 0,  0,  0],
    [0,   0,  0,  0,   0,  0, 0,  0,  0],
    [0,   0,  0,  0,   0,  0, 0,  0,  0],
    [0,   0,  0,  0,   0,  0, 0,  0,  0],
    [0,   0,  0,  1,   0,  1, 0,  0,  0],
    [0,   0,  0,  2,   0,  2, 0,  0,  0],
    [0,   0,  0,  11,  15, 11, 0,  0,  0]
  ]
};

// ── Board helpers ─────────────────────────────────────────────
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function cloneBoard(b) { return b.map(r => r.map(c => c ? { ...c } : null)); }
function opp(color) { return color === 'r' ? 'b' : 'r'; }

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
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'A') {
    const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'E') {
    const dirs = [[-2,-2],[-2,2],[2,-2],[2,2]];
    const blocked = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const rMin = color === 'r' ? 5 : 0;
    const rMax = color === 'r' ? 9 : 4;
    for (let i = 0; i < 4; i++) {
      const nr = row + dirs[i][0], nc = col + dirs[i][1];
      if (!inBounds(nr, nc) || nr < rMin || nr > rMax) continue;
      if (b[row + blocked[i][0]][col + blocked[i][1]]) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; }
        moves.push([nr, nc]);
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = row + dr, nc = col + dc;
      let jumped = false;
      while (inBounds(nr, nc)) {
        if (!jumped) {
          if (b[nr][nc]) jumped = true;
          else moves.push([nr, nc]);
        } else {
          if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; }
        }
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'N') {
    const steps = [
      [[-1,0],[-2,-1]],[[-1,0],[-2,1]],
      [[1,0],[2,-1]],[[1,0],[2,1]],
      [[0,-1],[-1,-2]],[[0,-1],[1,-2]],
      [[0,1],[-1,2]],[[0,1],[1,2]]
    ];
    for (const [[lr,lc],[dr,dc]] of steps) {
      const mr = row+lr, mc = col+lc;
      if (!inBounds(mr, mc) || b[mr][mc]) continue;
      const nr = row+dr, nc = col+dc;
      if (!inBounds(nr, nc)) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'P') {
    const fwd = color === 'r' ? -1 : 1;
    const crossed = color === 'r' ? row <= 4 : row >= 5;
    const nr = row + fwd;
    if (inBounds(nr, col) && canPlace(b, nr, col, color)) moves.push([nr, col]);
    if (crossed) {
      for (const dc of [-1, 1]) {
        const nc = col + dc;
        if (inBounds(row, nc) && canPlace(b, row, nc, color)) moves.push([row, nc]);
      }
    }
  }
  return moves;
}

function findKing(b, color) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c] && b[r][c].type === 'K' && b[r][c].color === color) return [r, c];
  return null;
}

function isInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return true;
  const [kr, kc] = king;
  const opponent = opp(color);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p || p.color !== opponent) continue;
      if (getRawMoves(b, r, c).some(([mr, mc]) => mr === kr && mc === kc)) return true;
    }
  }
  // Flying general
  const oppKing = findKing(b, opponent);
  if (oppKing && oppKing[1] === kc) {
    const minR = Math.min(kr, oppKing[0]) + 1;
    const maxR = Math.max(kr, oppKing[0]);
    if ([...new Array(maxR - minR)].every((_, i) => !b[minR + i][kc])) return true;
  }
  return false;
}

function getValidMovesAI(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  return getRawMoves(b, row, col).filter(([tr, tc]) => {
    const nb = cloneBoard(b);
    nb[tr][tc] = nb[row][col];
    nb[row][col] = null;
    return !isInCheck(nb, piece.color);
  });
}

function getAllMoves(b, color) {
  const moves = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c] && b[r][c].color === color)
        for (const [tr, tc] of getValidMovesAI(b, r, c))
          moves.push({ fromRow: r, fromCol: c, toRow: tr, toCol: tc });
  return moves;
}

// ── Evaluation ────────────────────────────────────────────────
function getPosScore(type, color, row, col) {
  const table = POS_TABLE[type];
  if (!table) return 0;
  // Red uses table as-is (red is at bottom, row 9)
  // Black flips vertically
  const r = color === 'r' ? row : (ROWS - 1 - row);
  return table[r]?.[col] ?? 0;
}

function evaluate(b, color) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p) continue;
      const val = PIECE_VALUE[p.type] + getPosScore(p.type, p.color, r, c);
      if (p.color === color) score += val;
      else score -= val;
    }
  }
  return score;
}

// ── Minimax ───────────────────────────────────────────────────
function minimax(b, depth, alpha, beta, maximizing, aiColor) {
  if (depth === 0) return evaluate(b, aiColor);

  const curr = maximizing ? aiColor : opp(aiColor);
  const moves = getAllMoves(b, curr);

  if (moves.length === 0) {
    return maximizing ? -90000 : 90000; // no moves = lose
  }

  if (maximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const nb = cloneBoard(b);
      nb[mv.toRow][mv.toCol] = nb[mv.fromRow][mv.fromCol];
      nb[mv.fromRow][mv.fromCol] = null;
      best = Math.max(best, minimax(nb, depth - 1, alpha, beta, false, aiColor));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const nb = cloneBoard(b);
      nb[mv.toRow][mv.toCol] = nb[mv.fromRow][mv.fromCol];
      nb[mv.fromRow][mv.fromCol] = null;
      best = Math.min(best, minimax(nb, depth - 1, alpha, beta, true, aiColor));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getBestMove(board, aiColor, difficulty) {
  const moves = getAllMoves(board, aiColor);
  if (moves.length === 0) return null;

  // Easy: depth 1 + 30% chance of random move
  if (difficulty === 'easy') {
    if (Math.random() < 0.30) return moves[Math.floor(Math.random() * moves.length)];
    // Depth 1
    let best = -Infinity, bestMove = moves[0];
    for (const mv of moves) {
      const nb = cloneBoard(board);
      nb[mv.toRow][mv.toCol] = nb[mv.fromRow][mv.fromCol];
      nb[mv.fromRow][mv.fromCol] = null;
      const score = evaluate(nb, aiColor);
      if (score > best) { best = score; bestMove = mv; }
    }
    return bestMove;
  }

  // Medium: depth 2
  // Hard: depth 4
  const depth = difficulty === 'hard' ? 4 : 2;

  // Move ordering: captures first (improves alpha-beta pruning)
  moves.sort((a, b) => {
    const ca = board[a.toRow][a.toCol];
    const cb = board[b.toRow][b.toCol];
    const va = ca ? PIECE_VALUE[ca.type] : 0;
    const vb = cb ? PIECE_VALUE[cb.type] : 0;
    return vb - va;
  });

  let best = -Infinity, bestMove = moves[0];
  for (const mv of moves) {
    const nb = cloneBoard(board);
    nb[mv.toRow][mv.toCol] = nb[mv.fromRow][mv.fromCol];
    nb[mv.fromRow][mv.fromCol] = null;
    const score = minimax(nb, depth - 1, -Infinity, Infinity, false, aiColor);
    if (score > best) { best = score; bestMove = mv; }
  }

  // Hard: occasionally use top-2 randomly to avoid total predictability
  return bestMove;
}

// ── Worker message handler ────────────────────────────────────
self.onmessage = function ({ data }) {
  const { board, color, difficulty } = data;
  const move = getBestMove(board, color, difficulty);
  self.postMessage(move);
};
