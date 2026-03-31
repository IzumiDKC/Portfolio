import { SOCKET_URL } from './constants.js';

export function createCaroOnline({ state, elements, ui, onCellClick }) {
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

    state.socket.removeAllListeners();

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

    state.socket.on('caro-start', ({ currentTurn, players }) => {
      state.onlinePlayers = players;
      state.currentTurnName = currentTurn;
      state.isGameOver = false;
      elements.historyLog.innerHTML = '';
      ui.initClientBoard(onCellClick);
      ui.updateOnlineTurnUI(currentTurn);
      elements.roomBadge.textContent = `🎮 ${state.currentRoomCode}`;
      elements.roomBadge.style.display = 'inline-block';
      ui.showScreen(elements.playScreen);
    });

    state.socket.on('caro-result', ({ playerName, row, col, symbol, currentTurn }) => {
      ui.updateCellUI(row, col, symbol);
      ui.addLog(playerName, symbol, row, col);
      state.currentTurnName = currentTurn;
      ui.updateOnlineTurnUI(currentTurn);
    });

    state.socket.on('caro-over', ({ winner, row, col, symbol, isDraw, reason }) => {
      state.isGameOver = true;
      if (row !== undefined && col !== undefined) {
        ui.updateCellUI(row, col, symbol, !isDraw);
        ui.addLog(winner !== 'Hòa / Draw' ? winner : '---', symbol, row, col);
      }

      setTimeout(() => {
        ui.showWinner({ winner, isDraw, reason });
      }, 800);
    });

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

    state.socket.on('back-to-lobby', ({ players }) => {
      state.onlinePlayers = players;
      ui.showScreen(elements.lobbyScreen);
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      ui.updateLobbyPlayerList(players);
      ui.syncHostControls();
    });

    state.socket.on('disconnect', () => {
      if (!state.isGameOver && elements.playScreen.classList.contains('active')) {
        alert(ui.getLang() === 'en' ? 'Connection lost!' : 'Mất kết nối!');
        ui.showScreen(elements.lobbyScreen);
        ui.resetLobbyUI();
      }
    });
  }

  function emitMove(row, col) {
    if (state.isGameOver || !state.socket || state.currentTurnName !== state.myPlayerName) {
      return;
    }

    if (state.board[row][col] !== null) {
      return;
    }

    state.socket.emit('caro-move', { row, col });
  }

  return {
    connectSocket,
    disconnectSocket,
    emitMove
  };
}
