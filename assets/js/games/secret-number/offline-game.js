import { pickAutoGuess, RANGE_STEP_LIMIT } from './constants.js';

export function createOfflineGame({ state, elements, ui, startAFKTimer, clearAFKTimer }) {
  function startOfflineGame() {
    state.minRange = 0;
    state.maxRange = 1000;
    state.secretAmount = Math.floor(Math.random() * 1001);
    state.currentPlayer = 1;
    state.isGameOver = false;
    state.offlinePenalties = {};

    elements.historyLog.innerHTML = '';
    elements.roomBadge.style.display = 'none';
    ui.updateRangeUI();
    ui.updateTurnUI();
    elements.guessInput.value = '';
    ui.setPlayInputEnabled(true);
    ui.showScreen(elements.playScreen);

    if (window._iyu && typeof window._iyu.getLang === 'function') {
      ui.triggerLangUpdate(window._iyu.getLang());
    }

    startAFKTimer();
  }

  function processGuess(botGuessVal = null, isAFK = false) {
    if (state.isGameOver) {
      return;
    }

    clearAFKTimer();
    const guess = botGuessVal !== null ? botGuessVal : parseInt(elements.guessInput.value.trim(), 10);

    if (Number.isNaN(guess) || guess < state.minRange || guess > state.maxRange) {
      alert(
        ui.getLang() === 'en'
          ? `Please enter a number between ${state.minRange} and ${state.maxRange}!`
          : `Vui lòng nhập số từ ${state.minRange} đến ${state.maxRange}!`
      );
      return;
    }

    if ((guess - state.minRange > RANGE_STEP_LIMIT) && (state.maxRange - guess > RANGE_STEP_LIMIT)) {
      alert(
        ui.getLang() === 'en'
          ? `Guess must be within 100 units from boundaries! (<= ${state.minRange + 100} or >= ${state.maxRange - 100})`
          : `Chỉ được đoán cách giới hạn hiện tại tối đa 100 đơn vị! (Vd: <= ${state.minRange + 100} hoặc >= ${state.maxRange - 100})`
      );
      return;
    }

    if (guess === state.secretAmount) {
      ui.endGame(state.currentPlayer, guess);
      return;
    }

    const isHigher = guess < state.secretAmount;
    if (isHigher) {
      state.minRange = guess;
    } else {
      state.maxRange = guess;
    }

    ui.addLog(state.currentPlayer, guess, isHigher, isAFK);
    ui.updateRangeUI();
    elements.guessInput.value = '';

    while (true) {
      state.currentPlayer += 1;
      if (state.currentPlayer > state.totalPlayers) {
        state.currentPlayer = 1;
      }

      if (state.offlinePenalties[state.currentPlayer] > 0) {
        state.offlinePenalties[state.currentPlayer] -= 1;
      } else {
        break;
      }
    }

    ui.updateTurnUI();

    if (state.mode === 'bot' && state.currentPlayer === 2 && !state.isGameOver) {
      ui.setPlayInputEnabled(false);
      setTimeout(botTurn, 800);
      return;
    }

    ui.setPlayInputEnabled(true);
    startAFKTimer();
  }

  function botTurn() {
    if (state.isGameOver) {
      return;
    }

    if (state.maxRange - state.minRange <= 2) {
      processGuess(state.minRange + 1);
      return;
    }

    processGuess(pickAutoGuess(state.minRange, state.maxRange));
  }

  return {
    processGuess,
    startOfflineGame
  };
}
