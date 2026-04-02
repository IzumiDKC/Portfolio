// ============================================================
//  Minesweeper – Solo (Single Player) Client Logic
// ============================================================

// Local screen switcher (modules don't share global scope)
function showScreen(name) {
  document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(name + 'Screen');
  if (el) el.classList.add('active');
}

const SOLO_BOARD_SIZE = 10;
const SOLO_MINE_COUNT = 15;

let soloBoard = [];
let soloMinesPlaced = false;
let soloGameOver = false;
let soloFlags = new Set();
let soloStartTime = null;
let soloTimerInterval = null;
let soloRevealedCount = 0;

const SOLO_TOTAL_SAFE = SOLO_BOARD_SIZE * SOLO_BOARD_SIZE - SOLO_MINE_COUNT; // 85

// ── DOM refs (Solo screen) ──────────────────────────────────
const soloScreen      = document.getElementById('soloScreen');
const soloBoardEl     = document.getElementById('solo-board');
const soloMineCounter = document.getElementById('soloMineCounter');
const soloTimer       = document.getElementById('soloTimer');
const soloStatus      = document.getElementById('soloStatus');
const soloBtnRestart  = document.getElementById('soloBtnRestart');
const btnPlaySolo     = document.getElementById('btnPlaySolo');
const btnBackFromSolo = document.getElementById('btnBackFromSolo');

// ── Board creation ─────────────────────────────────────────
function soloCreateBoard() {
  return Array(SOLO_BOARD_SIZE).fill(null).map(() =>
    Array(SOLO_BOARD_SIZE).fill(null).map(() => ({
      mine: false,
      revealed: false,
      adjacentMines: 0
    }))
  );
}

function soloPlaceMines(safeRow, safeCol) {
  const safeCells = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr, c = safeCol + dc;
      if (r >= 0 && r < SOLO_BOARD_SIZE && c >= 0 && c < SOLO_BOARD_SIZE)
        safeCells.add(`${r},${c}`);
    }
  }

  let placed = 0;
  while (placed < SOLO_MINE_COUNT) {
    const r = Math.floor(Math.random() * SOLO_BOARD_SIZE);
    const c = Math.floor(Math.random() * SOLO_BOARD_SIZE);
    if (!soloBoard[r][c].mine && !safeCells.has(`${r},${c}`)) {
      soloBoard[r][c].mine = true;
      placed++;
    }
  }

  // Calculate adjacentMines
  for (let r = 0; r < SOLO_BOARD_SIZE; r++) {
    for (let c = 0; c < SOLO_BOARD_SIZE; c++) {
      if (!soloBoard[r][c].mine) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < SOLO_BOARD_SIZE && nc >= 0 && nc < SOLO_BOARD_SIZE && soloBoard[nr][nc].mine)
              count++;
          }
        }
        soloBoard[r][c].adjacentMines = count;
      }
    }
  }
}

// Flood-fill reveal
function soloReveal(row, col) {
  const stack = [[row, col]];
  const visited = new Set([`${row},${col}`]);
  const revealed = [];

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    const cell = soloBoard[r][c];
    if (cell.revealed) continue;

    cell.revealed = true;
    soloRevealedCount++;
    revealed.push({ r, c });

    if (cell.adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          const key = `${nr},${nc}`;
          if (
            nr >= 0 && nr < SOLO_BOARD_SIZE &&
            nc >= 0 && nc < SOLO_BOARD_SIZE &&
            !visited.has(key) &&
            !soloBoard[nr][nc].mine &&
            !soloBoard[nr][nc].revealed
          ) {
            visited.add(key);
            stack.push([nr, nc]);
          }
        }
      }
    }
  }

  return revealed;
}

// ── Board rendering ─────────────────────────────────────────
function soloRenderBoard(showAll = false) {
  soloBoardEl.innerHTML = '';
  for (let r = 0; r < SOLO_BOARD_SIZE; r++) {
    for (let c = 0; c < SOLO_BOARD_SIZE; c++) {
      const cell = soloBoard[r][c];
      const key = `${r},${c}`;
      const isFlagged = soloFlags.has(key);
      const el = document.createElement('div');
      el.className = 'ms-cell';
      el.dataset.row = r;
      el.dataset.col = c;

      if (cell.revealed) {
        el.classList.add('revealed');
        if (cell.mine) {
          el.classList.add('mine');
          el.innerHTML = '💣';
        } else if (cell.adjacentMines > 0) {
          el.classList.add(`num-${cell.adjacentMines}`);
          el.textContent = cell.adjacentMines;
        }
      } else if (showAll && cell.mine) {
        el.classList.add('revealed', 'mine', 'mine-hidden');
        el.innerHTML = '💣';
      } else if (isFlagged) {
        el.classList.add('flagged');
        el.innerHTML = '🚩';
      }

      if (!soloGameOver && !cell.revealed && !isFlagged) {
        el.classList.add('clickable');
      }

      el.addEventListener('click', soloHandleClick);
      el.addEventListener('contextmenu', soloHandleRightClick);
      soloBoardEl.appendChild(el);
    }
  }
}

// ── Interaction ─────────────────────────────────────────────
function soloHandleClick(e) {
  if (soloGameOver) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  const cell = soloBoard[row][col];
  if (cell.revealed || soloFlags.has(`${row},${col}`)) return;

  // Place mines on first click
  if (!soloMinesPlaced) {
    soloPlaceMines(row, col);
    soloMinesPlaced = true;
    soloStartTime = Date.now();
    soloStartTimer();
  }

  if (cell.mine) {
    // Hit a mine!
    cell.revealed = true;
    soloGameOver = true;
    soloStopTimer();

    // Animate explosion
    const idx = row * SOLO_BOARD_SIZE + col;
    soloRenderBoard(true);
    const el = soloBoardEl.children[idx];
    if (el) {
      el.classList.add('exploded');
    }

    // Animate other mines popping
    Array.from(soloBoardEl.children).forEach((el, i) => {
      if (el.classList.contains('mine-hidden')) {
        el.style.animationDelay = `${i * 0.015}s`;
        el.classList.add('mine-reveal-anim');
      }
    });

    soloShowStatus('💥 Bạn đã trúng mìn! Game over!', 'lose');
    return;
  }

  soloReveal(row, col);

  // Animate revealed cells
  soloRenderBoard();
  animateSoloReveal();

  // Check win
  if (soloRevealedCount >= SOLO_TOTAL_SAFE) {
    soloGameOver = true;
    soloStopTimer();
    soloRenderBoard(true);
    const elapsed = soloGetElapsed();
    soloShowStatus(`🏆 Chiến thắng! Hoàn thành trong ${elapsed}!`, 'win');
  }
}

function soloHandleRightClick(e) {
  e.preventDefault();
  if (soloGameOver) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  if (soloBoard[row][col].revealed) return;
  const key = `${row},${col}`;
  if (soloFlags.has(key)) {
    soloFlags.delete(key);
  } else {
    soloFlags.add(key);
  }
  soloRenderBoard();
  soloUpdateMineCounter();
}

function animateSoloReveal() {
  Array.from(soloBoardEl.children).forEach((el) => {
    if (el.classList.contains('revealed') && !el.dataset.animated) {
      el.dataset.animated = '1';
      el.style.animationDelay = `${Math.random() * 0.08}s`;
      el.classList.add('just-revealed');
      setTimeout(() => el && el.classList.remove('just-revealed'), 600);
    }
  });
}

// ── Status & timer ──────────────────────────────────────────
function soloShowStatus(msg, type = '') {
  soloStatus.innerHTML = msg;
  soloStatus.className = 'solo-status-msg' + (type ? ' ' + type : '');
  soloStatus.style.display = 'block';
  soloBtnRestart.style.display = 'inline-flex';
}

function soloUpdateMineCounter() {
  if (soloMineCounter) soloMineCounter.textContent = SOLO_MINE_COUNT - soloFlags.size;
}

function soloStartTimer() {
  soloTimerInterval = setInterval(() => {
    if (soloTimer) soloTimer.textContent = soloGetElapsed();
  }, 1000);
}

function soloStopTimer() {
  clearInterval(soloTimerInterval);
}

function soloGetElapsed() {
  if (!soloStartTime) return '00:00';
  const s = Math.floor((Date.now() - soloStartTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ── Init / Restart ──────────────────────────────────────────
function soloInitGame() {
  soloBoard = soloCreateBoard();
  soloMinesPlaced = false;
  soloGameOver = false;
  soloFlags.clear();
  soloRevealedCount = 0;
  soloStartTime = null;
  soloStopTimer();

  if (soloTimer) soloTimer.textContent = '00:00';
  if (soloMineCounter) soloMineCounter.textContent = SOLO_MINE_COUNT;
  if (soloStatus) { soloStatus.style.display = 'none'; soloStatus.className = 'solo-status-msg'; }
  if (soloBtnRestart) soloBtnRestart.style.display = 'none';

  soloRenderBoard();
}

// ── Button wiring ───────────────────────────────────────────
if (btnPlaySolo) {
  btnPlaySolo.addEventListener('click', () => {
    showScreen('solo');
    soloInitGame();
  });
}

if (soloBtnRestart) {
  soloBtnRestart.addEventListener('click', soloInitGame);
}

if (btnBackFromSolo) {
  btnBackFromSolo.addEventListener('click', () => {
    soloStopTimer();
    showScreen('lobby');
  });
}

// Long-press for mobile in solo mode
(function() {
  let pressTimer = null;
  if (soloBoardEl) {
    soloBoardEl.addEventListener('touchstart', (e) => {
      const cell = e.target.closest('.ms-cell');
      if (!cell) return;
      pressTimer = setTimeout(() => {
        cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      }, 500);
    }, { passive: true });
    soloBoardEl.addEventListener('touchend', () => clearTimeout(pressTimer));
  }
})();
