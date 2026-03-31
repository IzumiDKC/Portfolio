import { RANGE_STEP_LIMIT, SOCKET_URL } from './constants.js';

export function createOnlineGame({ state, elements, ui, startAFKTimer, clearAFKTimer }) {
  function connectSocket() {
    return new Promise((resolve, reject) => {
      if (state.socket && state.socket.connected) {
        resolve(state.socket);
        return;
      }

      elements.connectingOverlay.classList.add('active');
      state.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 50000,
        reconnection: true,
        reconnectionAttempts: 5
      });

      const timeoutId = setTimeout(() => {
        elements.connectingOverlay.classList.remove('active');
        reject(new Error('Connection timeout'));
      }, 50000);

      state.socket.on('connect', () => {
        clearTimeout(timeoutId);
        elements.connectingOverlay.classList.remove('active');
        setupSocketListeners();
        resolve(state.socket);
      });

      state.socket.on('connect_error', (error) => {
        clearTimeout(timeoutId);
        elements.connectingOverlay.classList.remove('active');
        reject(error);
      });
    });
  }

  function disconnectSocket() {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }

    state.currentRoomCode = null;
    state.isHost = false;
    state.onlinePlayers = [];
  }

  function setupSocketListeners() {
    if (!state.socket) {
      return;
    }

    [
      'room-created',
      'join-error',
      'player-joined',
      'start-error',
      'game-start',
      'guess-result',
      'invalid-guess',
      'not-your-turn',
      'game-over',
      'player-left',
      'back-to-lobby',
      'disconnect'
    ].forEach((eventName) => state.socket.off(eventName));

    state.socket.on('room-created', ({ roomCode, players }) => {
      state.currentRoomCode = roomCode;
      state.isHost = true;
      state.onlinePlayers = players;
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      elements.roomCodeText.textContent = roomCode;
      ui.updateLobbyPlayerList(players);
      elements.btnStartOnline.disabled = players.length < 2;
    });

    state.socket.on('join-error', ({ message }) => {
      elements.lobbyStatus.textContent = message;
      elements.lobbyStatus.className = 'status-message error';
    });

    state.socket.on('player-joined', ({ players }) => {
      state.onlinePlayers = players;
      ui.updateLobbyPlayerList(players);
      elements.btnStartOnline.disabled = players.length < 2;

      if (!state.isHost) {
        elements.lobbyNameStep.style.display = 'none';
        elements.lobbyWaitStep.style.display = 'block';
        elements.roomCodeText.textContent = state.currentRoomCode;
      }
    });

    state.socket.on('start-error', ({ message }) => {
      elements.lobbyWaitStatus.textContent = message;
      elements.lobbyWaitStatus.className = 'status-message error';
    });

    state.socket.on('game-start', ({ minRange, maxRange, currentTurn, players }) => {
      state.onlinePlayers = players;
      state.minRange = minRange;
      state.maxRange = maxRange;
      state.currentTurnName = currentTurn;
      state.isGameOver = false;
      state.myTurnIndex = players.indexOf(state.myPlayerName);
      elements.historyLog.innerHTML = '';
      ui.updateRangeUI();
      ui.updateOnlineTurnUI(currentTurn);
      elements.roomBadge.textContent = `🎮 ${state.currentRoomCode}`;
      elements.roomBadge.style.display = 'inline-block';
      ui.setPlayInputEnabled(currentTurn === state.myPlayerName);
      elements.guessInput.value = '';
      ui.showScreen(elements.playScreen);
      startAFKTimer();
    });

    state.socket.on('guess-result', ({ playerName, guess, isHigher, minRange, maxRange, currentTurn, isAFK }) => {
      state.minRange = minRange;
      state.maxRange = maxRange;
      state.currentTurnName = currentTurn;
      ui.addLog(null, guess, isHigher, isAFK, playerName);
      ui.updateRangeUI();
      ui.updateOnlineTurnUI(currentTurn);
      ui.setPlayInputEnabled(currentTurn === state.myPlayerName);
      elements.guessInput.value = '';
      startAFKTimer();
    });

    state.socket.on('invalid-guess', ({ message }) => {
      alert(message);
    });

    state.socket.on('not-your-turn', () => {
      alert(ui.getLang() === 'en' ? 'Not your turn!' : 'Chưa đến lượt bạn!');
    });

    state.socket.on('game-over', ({ winner, secretNumber, reason }) => {
      state.isGameOver = true;

      if (reason === 'opponent-left') {
        const winVi = `🏆 ${winner} chiến thắng! (Đối thủ đã rời)`;
        const winEn = `🏆 ${winner} wins! (Opponent left)`;
        elements.winnerMessage.setAttribute('data-vi', winVi);
        elements.winnerMessage.setAttribute('data-en', winEn);
        elements.winnerMessage.textContent = ui.getLang() === 'en' ? winEn : winVi;
      } else {
        ui.endGame(null, secretNumber, winner);
      }

      elements.secretNumberDisplay.textContent = secretNumber;
      ui.showScreen(elements.gameOverScreen);

      const restartLabel = elements.btnRestart.querySelector('span');
      if (state.isHost) {
        restartLabel.setAttribute('data-vi', 'Chơi lại');
        restartLabel.setAttribute('data-en', 'Play Again');
        restartLabel.textContent = ui.getLang() === 'en' ? 'Play Again' : 'Chơi lại';
      } else {
        restartLabel.setAttribute('data-vi', 'Quay về');
        restartLabel.setAttribute('data-en', 'Back to Menu');
        restartLabel.textContent = ui.getLang() === 'en' ? 'Back to Menu' : 'Quay về';
      }
    });

    state.socket.on('player-left', ({ playerName, players, currentTurn, newHost }) => {
      state.onlinePlayers = players;
      state.isHost = newHost === state.myPlayerName;

      if (elements.lobbyScreen.classList.contains('active')) {
        ui.updateLobbyPlayerList(players);
        elements.btnStartOnline.disabled = players.length < 2;
      }

      if (elements.playScreen.classList.contains('active') && currentTurn) {
        state.currentTurnName = currentTurn;
        ui.updateOnlineTurnUI(currentTurn);
        ui.setPlayInputEnabled(currentTurn === state.myPlayerName);
        startAFKTimer();
      }

      ui.prependSystemMessage(
        ui.getLang() === 'en'
          ? `⚠️ ${playerName} left the game`
          : `⚠️ ${playerName} đã rời phòng`
      );
    });

    state.socket.on('back-to-lobby', ({ players }) => {
      state.onlinePlayers = players;
      ui.showScreen(elements.lobbyScreen);
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      ui.updateLobbyPlayerList(players);
      elements.btnStartOnline.disabled = players.length < 2;
    });

    state.socket.on('disconnect', () => {
      if (!state.isGameOver && elements.playScreen.classList.contains('active')) {
        alert(ui.getLang() === 'en' ? 'Connection lost!' : 'Mất kết nối!');
        ui.showScreen(elements.setupScreen);
      }
    });
  }

  function sendOnlineGuess(isAFK = false, forcedGuess = null) {
    if (state.isGameOver || !state.socket) {
      return;
    }

    clearAFKTimer();
    const guess = forcedGuess !== null ? forcedGuess : parseInt(elements.guessInput.value.trim(), 10);

    if (Number.isNaN(guess) || guess <= state.minRange || guess >= state.maxRange) {
      alert(
        ui.getLang() === 'en'
          ? `Please enter a number between ${state.minRange} and ${state.maxRange} (exclusive)!`
          : `Vui lòng nhập số trong khoảng ${state.minRange} - ${state.maxRange} (không bao gồm 2 đầu)!`
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

    state.socket.emit('guess', { number: guess, isAFK });
    elements.guessInput.value = '';
  }

  return {
    connectSocket,
    disconnectSocket,
    sendOnlineGuess
  };
}
