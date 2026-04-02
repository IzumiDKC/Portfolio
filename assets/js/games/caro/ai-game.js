import { checkWin } from './ai.js';

// Resolve the worker path relative to this module's location
const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

export function createCaroAiGame({ state, elements, ui }) {
  let worker = null;

  function getWorker() {
    if (!worker) {
      worker = new Worker(WORKER_URL); // plain script worker (no module type needed)
    }
    return worker;
  }

  // ── reset game state ─────────────────────────────────────────────────────
  function startGame() {
    // Terminate any previous worker computation
    if (worker) { worker.terminate(); worker = null; }

    state.isGameOver = false;
    state.isPlayerTurn = true;
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

  // ── cell click (player's move) ───────────────────────────────────────────
  function handleCellClick(row, col) {
    if (state.isGameOver || !state.isPlayerTurn) return;
    if (state.board[row][col] !== null) return;

    placeMove(row, col, state.playerSymbol, ui.getLang() === 'en' ? 'You' : 'Bạn');

    if (state.isGameOver) return;

    state.isPlayerTurn = false;
    ui.updateAiTurnUI(false, state.playerSymbol, state.difficulty);
    scheduleAiMove();
  }

  // ── send board to worker, receive move ────────────────────────────────────
  function scheduleAiMove() {
    if (state.isGameOver) return;

    // Deep-copy the board (worker runs on serialized data)
    const boardSnapshot = state.board.map(r => [...r]);

    const w = getWorker();
    w.onmessage = ({ data: move }) => {
      if (state.isGameOver) return;
      const aiLabel = ui.getLang() === 'en' ? 'AI' : 'Máy';
      placeMove(move.row, move.col, state.aiSymbol, aiLabel);
      if (!state.isGameOver) {
        state.isPlayerTurn = true;
        ui.updateAiTurnUI(true, state.playerSymbol, state.difficulty);
      }
    };
    w.onerror = (e) => {
      console.error('AI worker error:', e);
    };

    w.postMessage({
      board: boardSnapshot,
      aiSymbol: state.aiSymbol,
      difficulty: state.difficulty
    });
  }

  // ── place a piece and check win/draw ──────────────────────────────────────
  function placeMove(row, col, symbol, playerName) {
    ui.updateCellUI(row, col, symbol);
    ui.addLog(playerName, symbol, row, col);

    if (checkWin(state.board, row, col, symbol)) {
      state.isGameOver = true;
      ui.updateCellUI(row, col, symbol, true);
      const isPlayerWin = symbol === state.playerSymbol;
      setTimeout(() => {
        ui.showWinner({
          winner: isPlayerWin ? (ui.getLang() === 'en' ? 'You' : 'Bạn') : (ui.getLang() === 'en' ? 'AI' : 'Máy'),
          isDraw: false,
          isAiMode: true,
          isPlayerWin
        });
      }, 800);
      return;
    }

    const isFull = state.board.every(r => r.every(c => c !== null));
    if (isFull) {
      state.isGameOver = true;
      setTimeout(() => {
        ui.showWinner({ winner: null, isDraw: true, isAiMode: true });
      }, 800);
    }
  }

  // ── restart ───────────────────────────────────────────────────────────────
  function restart() {
    startGame();
  }

  return { startGame, restart };
}
