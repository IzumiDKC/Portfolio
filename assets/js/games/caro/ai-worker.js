const BOARD_SIZE = 20;
const WIN_SCORE = 10_000_000;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const MAX_QTABLE = 6000;
const OPENING_K = 3;
const MIN_OPENING_SAMPLE = 3;

class MLEngine {
  constructor(data = {}) {
    this.qTable = data.qTable || {};
    this.openingStats = data.openingStats || {};
    this.gamesPlayed = data.gamesPlayed || 0;
    this.gameTrace = [];
  }

  patternHash(board, row, col, aiSym) {
    let hash = '';
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
          hash += '#';
          continue;
        }
        const value = board[r][c];
        hash += value === null ? '_' : value === aiSym ? 'A' : 'H';
      }
    }
    return hash;
  }

  getBias(board, row, col, aiSym) {
    return this.qTable[this.patternHash(board, row, col, aiSym)] || 0;
  }

  recordMove(board, row, col, aiSym) {
    this.gameTrace.push(this.patternHash(board, row, col, aiSym));
  }

  learn(result, openingKey) {
    const reward = result === 'win' ? 0.7 : result === 'lose' ? -1.1 : 0.08;
    const alpha = 0.18;
    const gamma = 0.9;
    let discounted = reward;

    for (let i = this.gameTrace.length - 1; i >= 0; i--) {
      const hash = this.gameTrace[i];
      const current = this.qTable[hash] || 0;
      this.qTable[hash] = Math.max(-0.45, Math.min(0.45, current + alpha * (discounted - current)));
      discounted *= gamma;
    }

    if (openingKey) {
      if (!this.openingStats[openingKey]) {
        this.openingStats[openingKey] = { count: 0, humanWins: 0 };
      }
      this.openingStats[openingKey].count++;
      if (result === 'lose') {
        this.openingStats[openingKey].humanWins++;
      }
    }

    this.gamesPlayed++;
    this.gameTrace = [];
  }

  isExploitedOpening(humanMoves) {
    if (humanMoves.length < OPENING_K) return false;
    const key = humanMoves.slice(0, OPENING_K).join('|');
    const stat = this.openingStats[key];
    return !!(stat && stat.count >= MIN_OPENING_SAMPLE && (stat.humanWins / stat.count) >= 0.6);
  }

  get mlWeight() {
    if (this.gamesPlayed < 3) return 0.04;
    if (this.gamesPlayed < 10) return 0.08;
    if (this.gamesPlayed < 25) return 0.12;
    return 0.16;
  }

  serialize() {
    const pruned = Object.fromEntries(
      Object.entries(this.qTable)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, MAX_QTABLE)
    );

    return {
      qTable: pruned,
      openingStats: this.openingStats,
      gamesPlayed: this.gamesPlayed
    };
  }
}

let ml = new MLEngine();

function checkWin(board, row, col, symbol) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let step = 1; step < 5; step++) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
      count++;
    }
    for (let step = 1; step < 5; step++) {
      const r = row - dr * step;
      const c = col - dc * step;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

function fastThreatsAt(board, row, col, sym) {
  let five = 0;
  let open4 = 0;
  let broken4 = 0;
  let open3 = 0;
  let broken3 = 0;

  for (const [dr, dc] of DIRS) {
    const line = [];
    const startRow = row - dr * 4;
    const startCol = col - dc * 4;

    for (let i = 0; i < 9; i++) {
      const r = startRow + dr * i;
      const c = startCol + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
        line.push('W');
      } else {
        line.push(board[r][c]);
      }
    }

    for (let start = 0; start <= 4; start++) {
      let myCount = 0;
      let blocked = 0;
      for (let i = start; i < start + 5; i++) {
        if (line[i] === sym) myCount++;
        else if (line[i] !== null) blocked++;
      }
      if (blocked === 0) {
        if (myCount === 5) five++;
        else if (myCount === 4) broken4++;
        else if (myCount === 3) broken3++;
      }
    }

    for (let start = 0; start <= 3; start++) {
      let myCount = 0;
      let blocked = 0;
      for (let i = start; i < start + 6; i++) {
        if (line[i] === sym) myCount++;
        else if (line[i] !== null) blocked++;
      }
      if (blocked === 0 && line[start] === null && line[start + 5] === null) {
        let innerCount = 0;
        for (let i = start + 1; i < start + 5; i++) {
          if (line[i] === sym) innerCount++;
        }
        if (innerCount === 4) open4++;
        else if (innerCount === 3) open3++;
      }
    }
  }

  return { five, open4, broken4, open3, broken3 };
}

function classifyThreats(board, sym) {
  let five = 0;
  let open4 = 0;
  let broken4 = 0;
  let open3 = 0;
  let broken3 = 0;
  const visited = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== sym) continue;

      for (const [dr, dc] of DIRS) {
        let sr = r;
        let sc = c;
        while (
          sr - dr >= 0 && sr - dr < BOARD_SIZE &&
          sc - dc >= 0 && sc - dc < BOARD_SIZE &&
          board[sr - dr][sc - dc] === sym
        ) {
          sr -= dr;
          sc -= dc;
        }

        const key = `${sr},${sc},${dr},${dc}`;
        if (visited.has(key)) continue;
        visited.add(key);

        let count = 0;
        let er = sr;
        let ec = sc;
        while (er >= 0 && er < BOARD_SIZE && ec >= 0 && ec < BOARD_SIZE && board[er][ec] === sym) {
          count++;
          er += dr;
          ec += dc;
        }

        if (count >= 5) {
          five++;
          continue;
        }

        const beforeRow = sr - dr;
        const beforeCol = sc - dc;
        const afterRow = er;
        const afterCol = ec;
        const beforeOpen = beforeRow >= 0 && beforeRow < BOARD_SIZE && beforeCol >= 0 && beforeCol < BOARD_SIZE && board[beforeRow][beforeCol] === null;
        const afterOpen = afterRow >= 0 && afterRow < BOARD_SIZE && afterCol >= 0 && afterCol < BOARD_SIZE && board[afterRow][afterCol] === null;

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

  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const window = [];
        let ok = true;
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
            ok = false;
            break;
          }
          window.push(board[nr][nc]);
        }
        if (!ok) continue;

        let symCount = 0;
        let gapCount = 0;
        let oppCount = 0;
        for (const value of window) {
          if (value === sym) symCount++;
          else if (value === null) gapCount++;
          else oppCount++;
        }

        if (symCount === 4 && gapCount === 1 && oppCount === 0) {
          const pattern = window.map((value) => value === sym ? 'X' : '_').join('');
          if (pattern !== 'XXXX_' && pattern !== '_XXXX') {
            broken4++;
          }
        }
      }
    }
  }

  return { five, open4, broken4, open3, broken3 };
}

function moveCreatesFork(board, row, col, sym) {
  board[row][col] = sym;
  const threats = fastThreatsAt(board, row, col, sym);
  board[row][col] = null;
  return threats.open4 >= 1 || threats.broken4 >= 2 || threats.open3 >= 2 || (threats.broken4 >= 1 && threats.open3 >= 1);
}

function findLineEndBlocks(board, sym, n, requireBothOpen) {
  const spots = [];
  const visited = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== sym) continue;

      for (const [dr, dc] of DIRS) {
        let sr = r;
        let sc = c;
        while (
          sr - dr >= 0 && sr - dr < BOARD_SIZE &&
          sc - dc >= 0 && sc - dc < BOARD_SIZE &&
          board[sr - dr][sc - dc] === sym
        ) {
          sr -= dr;
          sc -= dc;
        }

        const key = `${sr},${sc},${dr},${dc}`;
        if (visited.has(key)) continue;
        visited.add(key);

        let count = 0;
        let er = sr;
        let ec = sc;
        while (er >= 0 && er < BOARD_SIZE && ec >= 0 && ec < BOARD_SIZE && board[er][ec] === sym) {
          count++;
          er += dr;
          ec += dc;
        }
        if (count !== n) continue;

        const beforeRow = sr - dr;
        const beforeCol = sc - dc;
        const afterRow = er;
        const afterCol = ec;
        const beforeOpen = beforeRow >= 0 && beforeRow < BOARD_SIZE && beforeCol >= 0 && beforeCol < BOARD_SIZE && board[beforeRow][beforeCol] === null;
        const afterOpen = afterRow >= 0 && afterRow < BOARD_SIZE && afterCol >= 0 && afterCol < BOARD_SIZE && board[afterRow][afterCol] === null;

        if (requireBothOpen) {
          if (beforeOpen && afterOpen) {
            spots.push({ row: beforeRow, col: beforeCol });
            spots.push({ row: afterRow, col: afterCol });
          }
        } else {
          if (beforeOpen) spots.push({ row: beforeRow, col: beforeCol });
          if (afterOpen) spots.push({ row: afterRow, col: afterCol });
        }
      }
    }
  }

  return spots;
}

function findGapBlocks(board, sym) {
  const spots = [];
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const window = [];
        let ok = true;
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
            ok = false;
            break;
          }
          window.push({ row: nr, col: nc, value: board[nr][nc] });
        }
        if (!ok) continue;

        let symCount = 0;
        let gapIndex = -1;
        let gapCount = 0;
        let oppCount = 0;
        for (let i = 0; i < 5; i++) {
          if (window[i].value === sym) symCount++;
          else if (window[i].value === null) {
            gapCount++;
            gapIndex = i;
          } else oppCount++;
        }

        if (symCount === 4 && gapCount === 1 && oppCount === 0) {
          spots.push({ row: window[gapIndex].row, col: window[gapIndex].col });
        }
      }
    }
  }
  return spots;
}

function scoreWindow(cells, symbol) {
  let myCount = 0;
  let oppCount = 0;
  for (const cell of cells) {
    if (cell === symbol) myCount++;
    else if (cell !== null) oppCount++;
  }
  if (oppCount > 0) return 0;

  switch (myCount) {
    case 5: return WIN_SCORE;
    case 4: return 200_000;
    case 3: return 8_000;
    case 2: return 120;
    case 1: return 5;
    default: return 0;
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
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
            ok = false;
            break;
          }
          cells.push(board[nr][nc]);
        }
        if (ok) score += scoreWindow(cells, symbol);
      }
    }
  }
  return score;
}

function getCandidates(board, aiSym, humanSym, maxCount = 15, radius = 2) {
  const seen = new Set();
  let hasAny = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) continue;
      hasAny = true;
      for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) {
            seen.add(nr * BOARD_SIZE + nc);
          }
        }
      }
    }
  }

  if (!hasAny) {
    const center = Math.floor(BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }

  const scored = [...seen].map((key) => {
    const row = Math.floor(key / BOARD_SIZE);
    const col = key % BOARD_SIZE;
    let score = 0;

    for (const [dr, dc] of DIRS) {
      let aiCount = 0;
      let humanCount = 0;
      let aiNear = 0;
      let humanNear = 0;
      for (let step = -4; step <= 4; step++) {
        if (step === 0) continue;
        const r = row + dr * step;
        const c = col + dc * step;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
        const value = board[r][c];
        if (value === aiSym) {
          aiCount++;
          if (Math.abs(step) <= 2) aiNear++;
        } else if (value === humanSym) {
          humanCount++;
          if (Math.abs(step) <= 2) humanNear++;
        }
      }
      score += aiNear * aiNear * 100 + aiCount * 20;
      score += humanNear * humanNear * 150 + humanCount * 30;
    }

    const centerDist = Math.abs(row - BOARD_SIZE / 2) + Math.abs(col - BOARD_SIZE / 2);
    score += Math.max(0, 20 - centerDist) * 5;

    return { row, col, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

function getTacticalCandidates(board, aiSym, humanSym, maxCount = 60) {
  return getCandidates(board, aiSym, humanSym, maxCount, 3);
}
function minimax(board, depth, alpha, beta, isMaximizing, aiSym, humanSym, lastMove) {
  if (lastMove && checkWin(board, lastMove.row, lastMove.col, isMaximizing ? humanSym : aiSym)) {
    return isMaximizing ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }

  if (depth === 0) {
    return evaluateBoard(board, aiSym) - evaluateBoard(board, humanSym) * 2.5;
  }

  const candidates = getCandidates(board, aiSym, humanSym, 6);
  if (candidates.length === 0) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSym;
      const score = minimax(board, depth - 1, alpha, beta, false, aiSym, humanSym, { row, col });
      board[row][col] = null;
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const { row, col } of candidates) {
    board[row][col] = humanSym;
    const score = minimax(board, depth - 1, alpha, beta, true, aiSym, humanSym, { row, col });
    board[row][col] = null;
    best = Math.min(best, score);
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function tacticalPenalty(board, row, col, aiSym, humanSym) {
  board[row][col] = aiSym;
  const humanThreats = classifyThreats(board, humanSym);
  const aiThreats = fastThreatsAt(board, row, col, aiSym);
  board[row][col] = null;

  return (
    humanThreats.open4 * 400_000 +
    humanThreats.broken4 * 80_000 +
    humanThreats.open3 * 18_000 -
    aiThreats.open4 * 50_000 -
    aiThreats.broken4 * 10_000 -
    aiThreats.open3 * 2_000
  );
}

function chooseOpeningResponse(board, aiSym, humanSym, candidates) {
  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const { row, col } of candidates) {
    const penalty = tacticalPenalty(board, row, col, aiSym, humanSym);
    const centerDist = Math.abs(row - BOARD_SIZE / 2) + Math.abs(col - BOARD_SIZE / 2);
    const score = -penalty - centerDist * 20;
    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}

function choosePureMinimaxMove(board, aiSym, humanSym, candidates, depth = 3, poolSize = 6) {
  let bestScore = -Infinity;
  let bestMove = candidates[0];

  for (const { row, col } of candidates.slice(0, poolSize)) {
    board[row][col] = aiSym;
    const score = minimax(board, depth, -Infinity, Infinity, false, aiSym, humanSym, { row, col })
      - tacticalPenalty(board, row, col, aiSym, humanSym);
    board[row][col] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}

function findBestBlock(board, sym, candidates) {
  const aiSym = sym === 'X' ? 'O' : 'X';
  let bestMove = null;
  let bestScore = -Infinity;

  for (const { row, col } of candidates) {
    board[row][col] = aiSym;
    const humanAfter = classifyThreats(board, sym);
    const aiAfter = fastThreatsAt(board, row, col, aiSym);
    board[row][col] = null;

    const score =
      -(humanAfter.open4 * 120_000 + humanAfter.broken4 * 20_000 + humanAfter.open3 * 4_000 + humanAfter.broken3 * 300) +
      aiAfter.broken4 * 5_000 + aiAfter.open3 * 500;

    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}

function computeHardMove(board, aiSym, humanSym, candidates, humanMoves) {
  const humanThreats = classifyThreats(board, humanSym);
  const tacticalCandidates = getTacticalCandidates(board, aiSym, humanSym, 60);

  for (const { row, col } of tacticalCandidates) {
    board[row][col] = aiSym;
    if (checkWin(board, row, col, aiSym)) {
      board[row][col] = null;
      return { row, col };
    }
    board[row][col] = null;
  }

  for (const { row, col } of tacticalCandidates) {
    board[row][col] = humanSym;
    if (checkWin(board, row, col, humanSym)) {
      board[row][col] = null;
      return { row, col };
    }
    board[row][col] = null;
  }

  if (humanThreats.open4 >= 1) {
    const blocks = findLineEndBlocks(board, humanSym, 4, true);
    if (blocks.length > 0) {
      return findBestBlock(board, humanSym, blocks) || blocks[0];
    }
  }

  for (const { row, col } of candidates) {
    board[row][col] = aiSym;
    const aiAfter = fastThreatsAt(board, row, col, aiSym);
    board[row][col] = null;
    if (aiAfter.open4 >= 1 || aiAfter.broken4 >= 2) {
      return { row, col };
    }
  }

  if (humanThreats.broken4 >= 1) {
    const lineBlocks = findLineEndBlocks(board, humanSym, 4, false);
    if (lineBlocks.length > 0) {
      return findBestBlock(board, humanSym, lineBlocks) || lineBlocks[0];
    }
    const gapBlocks = findGapBlocks(board, humanSym);
    if (gapBlocks.length > 0) {
      return findBestBlock(board, humanSym, gapBlocks) || gapBlocks[0];
    }
  }

  const defenseCandidates = getTacticalCandidates(board, aiSym, humanSym, 80);
  const forkMoves = defenseCandidates.filter(({ row, col }) => moveCreatesFork(board, row, col, humanSym));
  if (forkMoves.length > 0) {
    return findBestBlock(board, humanSym, forkMoves) || forkMoves[0];
  }

  const futureThreats = [];
  for (const { row, col } of defenseCandidates) {
    board[row][col] = humanSym;
    const threat = fastThreatsAt(board, row, col, humanSym);
    board[row][col] = null;
    if (threat.open4 >= 1 || threat.broken4 >= 1) {
      futureThreats.push({ row, col, urgency: threat.open4 * 100 + threat.broken4 * 10 + threat.open3 * 2 });
    }
  }
  if (futureThreats.length > 0) {
    futureThreats.sort((a, b) => b.urgency - a.urgency);
    return findBestBlock(board, humanSym, futureThreats) || futureThreats[0];
  }

  const aiForkMoves = candidates.filter(({ row, col }) => moveCreatesFork(board, row, col, aiSym));
  if (aiForkMoves.length > 0) {
    return aiForkMoves[0];
  }

  for (const { row, col } of candidates) {
    board[row][col] = aiSym;
    const aiAfter = fastThreatsAt(board, row, col, aiSym);
    board[row][col] = null;
    if (aiAfter.broken4 >= 1) {
      return { row, col };
    }
  }

  if (humanThreats.open3 >= 1) {
    let bestMove = null;
    let bestScore = -Infinity;
    for (const { row, col } of candidates) {
      board[row][col] = aiSym;
      const humanAfter = classifyThreats(board, humanSym);
      const aiAfter = fastThreatsAt(board, row, col, aiSym);
      board[row][col] = null;

      const score =
        -(humanAfter.open4 * 120_000 + humanAfter.broken4 * 20_000 + humanAfter.open3 * 5_000) +
        aiAfter.broken4 * 3_000 + aiAfter.open3 * 800;

      if (score > bestScore) {
        bestScore = score;
        bestMove = { row, col };
      }
    }
    if (bestMove) return bestMove;
  }

  const weight = ml.mlWeight;
  const pool = candidates.slice(0, 6);
  const scored = pool.map(({ row, col }) => {
    board[row][col] = aiSym;
    const mmScore = minimax(board, 3, -Infinity, Infinity, false, aiSym, humanSym, { row, col });
    board[row][col] = null;
    const penalty = tacticalPenalty(board, row, col, aiSym, humanSym);
    const mlBias = ml.getBias(board, row, col, aiSym) * weight * 25_000;
    return { row, col, total: mmScore - penalty + mlBias };
  });
  scored.sort((a, b) => b.total - a.total);

  if (ml.isExploitedOpening(humanMoves)) {
    const widened = getCandidates(board, aiSym, humanSym, 10);
    return choosePureMinimaxMove(board, aiSym, humanSym, widened, 4, 8);
  }

  return scored[0] || candidates[0];
}

self.onmessage = function ({ data }) {
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
  const humanMoves = data.humanMoves || [];
  const piecesOnBoard = board.flat().filter((value) => value !== null).length;

  if (piecesOnBoard === 0) {
    const center = Math.floor(BOARD_SIZE / 2);
    self.postMessage({ row: center, col: center });
    return;
  }

  if (piecesOnBoard === 1) {
    const early = getCandidates(board, aiSymbol, humanSymbol, 8);
    const move = difficulty === 'hard' ? chooseOpeningResponse(board, aiSymbol, humanSymbol, early) : early[0];
    if (difficulty === 'hard') {
      ml.recordMove(board, move.row, move.col, aiSymbol);
    }
    self.postMessage(move);
    return;
  }

  if (piecesOnBoard <= 3) {
    const early = getCandidates(board, aiSymbol, humanSymbol, 10);
    for (const { row, col } of early) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) {
        board[row][col] = null;
        if (difficulty === 'hard') ml.recordMove(board, row, col, aiSymbol);
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }
    for (const { row, col } of early) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) {
        board[row][col] = null;
        if (difficulty === 'hard') ml.recordMove(board, row, col, aiSymbol);
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }

    const move = difficulty === 'hard' ? chooseOpeningResponse(board, aiSymbol, humanSymbol, early) : early[0];
    if (difficulty === 'hard') {
      ml.recordMove(board, move.row, move.col, aiSymbol);
    }
    self.postMessage(move);
    return;
  }

  const candidates = getCandidates(board, aiSymbol, humanSymbol, 20);
  const tacticalCandidates = getTacticalCandidates(board, aiSymbol, humanSymbol, 60);

  if (difficulty === 'easy') {
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) {
        board[row][col] = null;
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) {
        board[row][col] = null;
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }
    if (Math.random() < 0.55) {
      const top = candidates.slice(0, Math.min(10, candidates.length));
      self.postMessage(top[Math.floor(Math.random() * top.length)]);
      return;
    }
    self.postMessage(choosePureMinimaxMove(board, aiSymbol, humanSymbol, candidates, 0, 10));
    return;
  }

  if (difficulty === 'medium') {
    for (const { row, col } of candidates) {
      board[row][col] = aiSymbol;
      if (checkWin(board, row, col, aiSymbol)) {
        board[row][col] = null;
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }
    for (const { row, col } of candidates) {
      board[row][col] = humanSymbol;
      if (checkWin(board, row, col, humanSymbol)) {
        board[row][col] = null;
        self.postMessage({ row, col });
        return;
      }
      board[row][col] = null;
    }

    const humanThreats = classifyThreats(board, humanSymbol);
    if (humanThreats.open4 >= 1 || humanThreats.broken4 >= 1 || humanThreats.open3 >= 1) {
      self.postMessage(findBestBlock(board, humanSymbol, candidates) || candidates[0]);
      return;
    }

    self.postMessage(choosePureMinimaxMove(board, aiSymbol, humanSymbol, candidates, 2, 12));
    return;
  }

  const move = computeHardMove(board, aiSymbol, humanSymbol, candidates, humanMoves);
  ml.recordMove(board, move.row, move.col, aiSymbol);
  self.postMessage(move);
};





