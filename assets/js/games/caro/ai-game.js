import { checkWin } from './ai.js';
import { loadMLData, saveMLData } from './ml-storage.js';

// Resolve the worker path relative to this module's location
const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

export function createCaroAiGame({ state, elements, ui }) {
  let worker = null;
  // Load ML data once at module init. Updated after each completed game.
  let mlData = loadMLData();

  // ── Create/reuse worker, inject ML data on first creation ────────────────
  function getWorker() {
    if (!worker) {
      worker = new Worker(WORKER_URL);
      // Seed the worker with persisted Q-table + opening stats
      worker.postMessage({ type: 'init', mlData });
      // Route all worker messages through a shared handler
      worker.onmessage = handleWorkerMessage;
      worker.onerror   = (e) => console.error('[AI Worker]', e);
    }
    return worker;
  }

  // ── Shared handler: move response OR ML update ───────────────────────────
  function handleWorkerMessage({ data: msg }) {
    // ML learning result → persist updated Q-table
    if (msg && msg.type === 'mlUpdate') {
      mlData = msg.mlData;
      saveMLData(mlData);
      return;
    }
    // Stop probe animation and commit the real move
    stopProbeAnimation();
    if (state.isGameOver) return;
    const aiLabel = ui.getLang() === 'en' ? 'AI' : 'Máy';
    placeMove(msg.row, msg.col, state.aiSymbol, aiLabel);
    if (!state.isGameOver) {
      state.isPlayerTurn = true;
      ui.updateAiTurnUI(true, state.playerSymbol, state.difficulty);
    }
  }

  // ── Reset game state ──────────────────────────────────────────────────────
  function startGame() {
    // Terminate pending heavy minimax computation (if any)
    if (worker) { worker.terminate(); worker = null; }

    state.isGameOver    = false;
    state.isPlayerTurn  = true;
    state.humanMoveList = []; // track human moves for ML opening detection

    elements.historyLog.innerHTML = '';
    elements.roomBadge.style.display = 'none';

    ui.initClientBoard(handleCellClick);
    ui.updateAiTurnUI(true, state.playerSymbol, state.difficulty);
    ui.showScreen(elements.playScreen);

    // If AI goes first (player chose O)
    if (state.playerSymbol === 'O') {
      state.isPlayerTurn = false;
      ui.updateAiTurnUI(false, state.playerSymbol, state.difficulty);
      scheduleAiMove();
    }
  }

  // ── Cell click (player's move) ────────────────────────────────────────────
  function handleCellClick(row, col) {
    if (state.isGameOver || !state.isPlayerTurn) return;
    if (state.board[row][col] !== null) return;

    // Record human move for ML opening detection (before placing)
    state.humanMoveList.push(`${row},${col}`);

    placeMove(row, col, state.playerSymbol, ui.getLang() === 'en' ? 'You' : 'Bạn');
    if (state.isGameOver) return;

    state.isPlayerTurn = false;
    ui.updateAiTurnUI(false, state.playerSymbol, state.difficulty);
    scheduleAiMove();
  }

  // ── Send board to worker, receive move ────────────────────────────────────
  function scheduleAiMove() {
    if (state.isGameOver) return;
    const boardSnapshot = state.board.map(r => [...r]);
    getWorker().postMessage({
      board:      boardSnapshot,
      aiSymbol:   state.aiSymbol,
      difficulty: state.difficulty,
      humanMoves: state.humanMoveList
    });

    // Hard mode: animate ghost probes while worker is computing
    if (state.difficulty === 'hard') {
      startProbeAnimation();
    }
  }

  // ── Probe animation: flash ghost cells to simulate AI "trying" moves ──────
  let probeTimer = null;
  let probeStep  = 0;

  function startProbeAnimation() {
    stopProbeAnimation();
    probeStep = 0;
    const BOARD_SIZE = state.board.length;
    const totalSteps = 6 + Math.floor(Math.random() * 5); // 6–10 fake probes

    probeTimer = setInterval(() => {
      // Clear previous probe cell
      const prev = elements.caroBoard.querySelector('.ai-probe');
      if (prev) prev.classList.remove('ai-probe');

      probeStep++;
      if (probeStep > totalSteps) {
        stopProbeAnimation();
        return;
      }

      // Pick a random empty cell near existing pieces
      const emptyCells = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (state.board[r][c] === null) {
            // Only cells near existing pieces (within ±3)
            let hasNeighbor = false;
            outer: for (let dr = -3; dr <= 3; dr++) {
              for (let dc = -3; dc <= 3; dc++) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && state.board[nr][nc] !== null) {
                  hasNeighbor = true; break outer;
                }
              }
            }
            if (hasNeighbor) emptyCells.push(r * BOARD_SIZE + c);
          }
        }
      }

      if (emptyCells.length > 0) {
        const idx = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const cell = elements.caroBoard.children[idx];
        if (cell && !cell.classList.contains('cell-x') && !cell.classList.contains('cell-o')) {
          cell.classList.add('ai-probe');
        }
      }

      ui.updateThinkingStatus(probeStep, totalSteps);
    }, 120);
  }

  function stopProbeAnimation() {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    const prev = elements.caroBoard.querySelector('.ai-probe');
    if (prev) prev.classList.remove('ai-probe');
  }

  // ── After game ends, trigger ML learning (hard mode only) ────────────────
  function triggerLearning(result) {
    if (state.difficulty !== 'hard') return;
    const openingKey = state.humanMoveList.slice(0, 3).join('|');
    // Worker must still be alive; if terminated (e.g. mid-game restart) skip
    if (!worker) return;
    worker.postMessage({ type: 'learn', result, openingKey });
    // Response (mlUpdate) is handled by the shared handleWorkerMessage
  }

  // ── Place piece → check win/draw → trigger learning on game end ───────────
  function placeMove(row, col, symbol, playerName) {
    ui.updateCellUI(row, col, symbol);
    ui.addLog(playerName, symbol, row, col);

    if (checkWin(state.board, row, col, symbol)) {
      state.isGameOver = true;
      ui.updateCellUI(row, col, symbol, true);
      const isPlayerWin = symbol === state.playerSymbol;

      // Trigger ML: 'win' = AI won, 'lose' = human won
      triggerLearning(isPlayerWin ? 'lose' : 'win');

      setTimeout(() => {
        ui.showWinner({
          winner:      isPlayerWin ? (ui.getLang() === 'en' ? 'You' : 'Bạn') : (ui.getLang() === 'en' ? 'AI' : 'Máy'),
          isDraw:      false,
          isAiMode:    true,
          isPlayerWin
        });
      }, 800);
      return;
    }

    const isFull = state.board.every(r => r.every(c => c !== null));
    if (isFull) {
      state.isGameOver = true;
      triggerLearning('draw');
      setTimeout(() => {
        ui.showWinner({ winner: null, isDraw: true, isAiMode: true });
      }, 800);
    }
  }

  // ── Restart ───────────────────────────────────────────────────────────────
  function restart() {
    startGame();
  }

  return { startGame, restart };
}
