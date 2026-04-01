import { SOCKET_URL, TURN_DURATION } from './constants.js';

export function createGoOnline({ state, elements, ui, onCellClick }) {

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
    ui.stopClientTimer();
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    state.currentRoomCode = null;
    state.isHost = false;
    state.onlinePlayers = [];
    state.isGameOver = false;
  }

  function setupSocketListeners() {
    if (!state.socket) return;
    state.socket.removeAllListeners();

    // ── Lobby ────────────────────────────────────────────────
    state.socket.on('room-created', ({ roomCode, players }) => {
      state.currentRoomCode = roomCode;
      state.isHost = true;
      state.onlinePlayers = players;
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      elements.roomCodeText.textContent = roomCode;
      ui.updateLobbyPlayerList(players);
      ui.syncHostControls();
    });

    state.socket.on('join-error', ({ message }) => {
      elements.lobbyStatus.textContent = message;
      elements.lobbyStatus.className = 'status-message error';
    });

    state.socket.on('player-joined', ({ players }) => {
      state.onlinePlayers = players;
      ui.updateLobbyPlayerList(players);
      if (!state.isHost) {
        elements.lobbyNameStep.style.display = 'none';
        elements.lobbyWaitStep.style.display = 'block';
        elements.roomCodeText.textContent = state.currentRoomCode;
      }
      ui.syncHostControls();
    });

    // ── Game Start ───────────────────────────────────────────
    state.socket.on('go-start', ({ currentTurn, currentTurnIndex, players }) => {
      state.onlinePlayers = players;
      state.currentTurnName = currentTurn;
      state.isGameOver = false;
      state.captures = { black: 0, white: 0 };

      // Determine my color
      const myIdx = players.indexOf(state.myPlayerName);
      state.myColor = myIdx === 0 ? 'B' : 'W';

      elements.historyLog.innerHTML = '';
      elements.roomBadge.textContent = `🎮 ${state.currentRoomCode}`;
      elements.roomBadge.style.display = 'inline-block';

      ui.buildBoard(onCellClick);
      ui.updateTurnUI(currentTurn);
      ui.updateCaptures(state.captures);
      ui.startClientTimer(TURN_DURATION);
      ui.showScreen(elements.playScreen);
    });

    // ── Move Result ──────────────────────────────────────────
    state.socket.on('go-result', ({ playerName, row, col, color, currentTurn, currentTurnIndex, captures, capturedCount }) => {
      ui.clearLastMoveMarkers();
      ui.placeStoneUI(row, col, color, true);
      ui.addMoveLog(playerName, color, row, col);
      state.currentTurnName = currentTurn;
      state.captures = captures;
      ui.updateCaptures(captures);
      ui.updateTurnUI(currentTurn);
      ui.startClientTimer(TURN_DURATION);
    });

    // ── Pass ─────────────────────────────────────────────────
    state.socket.on('go-passed', ({ playerName, currentTurn, consecutivePasses, autoPass }) => {
      ui.addPassLog(playerName, autoPass);
      state.currentTurnName = currentTurn;
      state.consecutivePasses = consecutivePasses;
      ui.updateTurnUI(currentTurn);
      ui.startClientTimer(TURN_DURATION);
    });

    // ── Timer sync ───────────────────────────────────────────
    state.socket.on('go-timer-tick', ({ timeLeft }) => {
      ui.tickTimer(timeLeft);
    });

    // ── Game Over ─────────────────────────────────────────────
    state.socket.on('go-over', (data) => {
      state.isGameOver = true;
      ui.stopClientTimer();
      setTimeout(() => {
        ui.showWinner(data);
      }, 500);
    });

    // ── Player left ──────────────────────────────────────────
    state.socket.on('player-left', ({ playerName, players, newHost }) => {
      state.onlinePlayers = players;
      state.isHost = newHost === state.myPlayerName;
      if (elements.lobbyScreen.classList.contains('active')) {
        ui.updateLobbyPlayerList(players);
        ui.syncHostControls();
      }
      ui.prependSystemLog(
        ui.getLang() === 'en'
          ? `⚠️ ${playerName} left the room`
          : `⚠️ ${playerName} đã rời phòng`
      );
    });

    // ── Back to lobby ─────────────────────────────────────────
    state.socket.on('back-to-lobby', ({ players }) => {
      state.onlinePlayers = players;
      state.isGameOver = false;
      ui.stopClientTimer();
      ui.showScreen(elements.lobbyScreen);
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      ui.updateLobbyPlayerList(players);
      ui.syncHostControls();
    });

    // ── Disconnect ────────────────────────────────────────────
    state.socket.on('disconnect', () => {
      if (!state.isGameOver && elements.playScreen.classList.contains('active')) {
        alert(ui.getLang() === 'en' ? 'Connection lost!' : 'Mất kết nối!');
        ui.stopClientTimer();
        ui.showScreen(elements.lobbyScreen);
        ui.resetLobbyUI();
      }
    });
  }

  function emitMove(row, col) {
    if (state.isGameOver || !state.socket) return;
    if (state.currentTurnName !== state.myPlayerName) return;
    if (state.board[row][col] !== null) return;
    state.socket.emit('go-move', { row, col });
  }

  function emitPass() {
    if (state.isGameOver || !state.socket) return;
    if (state.currentTurnName !== state.myPlayerName) return;
    state.socket.emit('go-pass');
  }

  function emitResign() {
    if (state.isGameOver || !state.socket) return;
    state.socket.emit('go-resign');
  }

  return { connectSocket, disconnectSocket, emitMove, emitPass, emitResign };
}
