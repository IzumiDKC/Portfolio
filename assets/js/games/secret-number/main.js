import { AFK_TIMEOUT_MS, pickAutoGuess } from './constants.js';
import { getElements } from './dom.js';
import { createOfflineGame } from './offline-game.js';
import { createOnlineGame } from './online-game.js';
import { createGameState } from './state.js';
import { createUi } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = createGameState();
  const elements = getElements();
  const ui = createUi({ state, elements });

  function clearAFKTimer() {
    clearTimeout(state.afkTimer);
  }

  let offlineGame;
  let onlineGame;

  function startAFKTimer() {
    clearAFKTimer();
    if (state.isGameOver) {
      return;
    }

    let shouldStart = false;
    if (state.mode === 'multi' || (state.mode === 'bot' && state.currentPlayer === 1)) {
      shouldStart = true;
    } else if (state.mode === 'online') {
      shouldStart = state.currentTurnName === state.myPlayerName;
    }

    if (!shouldStart) {
      return;
    }

    state.afkTimer = setTimeout(() => {
      const autoGuess = pickAutoGuess(state.minRange, state.maxRange);
      if (state.mode === 'online') {
        onlineGame.sendOnlineGuess(true, autoGuess);
        return;
      }

      state.offlinePenalties[state.currentPlayer] = (state.offlinePenalties[state.currentPlayer] || 0) + 1;
      offlineGame.processGuess(autoGuess, true);
    }, AFK_TIMEOUT_MS);
  }

  offlineGame = createOfflineGame({ state, elements, ui, startAFKTimer, clearAFKTimer });
  onlineGame = createOnlineGame({ state, elements, ui, startAFKTimer, clearAFKTimer });

  elements.gameModeSelect.addEventListener('change', (event) => {
    elements.playerCountGroup.style.display = event.target.value === 'multi' ? 'block' : 'none';
  });

  elements.btnStart.addEventListener('click', () => {
    state.mode = elements.gameModeSelect.value;
    if (state.mode === 'online') {
      ui.showScreen(elements.lobbyScreen);
      ui.resetLobbyUI();
      return;
    }

    if (state.mode === 'multi') {
      state.totalPlayers = parseInt(elements.playerCountInput.value, 10) || 2;
      state.totalPlayers = Math.min(Math.max(state.totalPlayers, 2), 10);
    } else {
      state.totalPlayers = 2;
    }

    offlineGame.startOfflineGame();
  });

  elements.btnGuess.addEventListener('click', () => {
    if (state.mode === 'online') {
      onlineGame.sendOnlineGuess();
      return;
    }

    offlineGame.processGuess();
  });

  elements.guessInput.addEventListener('keypress', (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    if (state.mode === 'online') {
      onlineGame.sendOnlineGuess();
      return;
    }

    offlineGame.processGuess();
  });

  elements.btnRestart.addEventListener('click', () => {
    if (state.mode === 'online') {
      if (state.isHost && state.socket) {
        state.socket.emit('play-again');
      } else {
        onlineGame.disconnectSocket();
        ui.showScreen(elements.setupScreen);
      }
      return;
    }

    elements.gameOverScreen.classList.remove('active');
    elements.setupScreen.classList.add('active');
  });

  if (elements.langToggleBtn) {
    elements.langToggleBtn.addEventListener('click', () => {
      requestAnimationFrame(() => {
        ui.triggerLangUpdate(ui.getLang());
      });
    });
  }

  elements.btnCreateRoom.addEventListener('click', async () => {
    const name = elements.onlineNameInput.value.trim();
    if (!name) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Please enter your name' : 'Vui lòng nhập tên';
      elements.lobbyStatus.className = 'status-message error';
      return;
    }

    state.myPlayerName = name;
    localStorage.setItem('onlinePlayerName', name);

    try {
      await onlineGame.connectSocket();
      state.socket.emit('create-room', { playerName: name });
    } catch (error) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en'
        ? 'Cannot connect to server. Please try again.'
        : 'Không thể kết nối server. Vui lòng thử lại.';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  elements.btnShowJoin.addEventListener('click', () => {
    elements.joinRoomGroup.classList.toggle('active');
    elements.roomCodeInput.focus();
  });

  elements.btnJoinRoom.addEventListener('click', async () => {
    const name = elements.onlineNameInput.value.trim();
    const code = elements.roomCodeInput.value.trim().toUpperCase();

    if (!name) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Please enter your name' : 'Vui lòng nhập tên';
      elements.lobbyStatus.className = 'status-message error';
      return;
    }

    if (!code || code.length < 4) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en'
        ? 'Please enter a valid room code'
        : 'Vui lòng nhập mã phòng hợp lệ';
      elements.lobbyStatus.className = 'status-message error';
      return;
    }

    state.myPlayerName = name;
    state.currentRoomCode = code;
    localStorage.setItem('onlinePlayerName', name);

    try {
      await onlineGame.connectSocket();
      state.socket.emit('join-room', { roomCode: code, playerName: name });
    } catch (error) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en'
        ? 'Cannot connect to server. Please try again.'
        : 'Không thể kết nối server. Vui lòng thử lại.';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  elements.btnBackToSetup.addEventListener('click', () => {
    onlineGame.disconnectSocket();
    ui.showScreen(elements.setupScreen);
  });

  elements.btnStartOnline.addEventListener('click', () => {
    if (state.isHost && state.socket) {
      state.socket.emit('start-game');
    }
  });

  elements.btnLeaveLobby.addEventListener('click', () => {
    onlineGame.disconnectSocket();
    ui.showScreen(elements.setupScreen);
  });

  elements.roomCodeDisplay.addEventListener('click', () => {
    const code = elements.roomCodeText.textContent;
    navigator.clipboard.writeText(code).then(() => {
      const hint = elements.roomCodeDisplay.querySelector('.copy-hint');
      const original = hint.textContent;
      hint.textContent = ui.getLang() === 'en' ? '✅ Copied!' : '✅ Đã sao chép!';
      hint.style.color = '#22c55e';
      setTimeout(() => {
        hint.textContent = original;
        hint.style.color = '';
      }, 2000);
    });
  });
});
