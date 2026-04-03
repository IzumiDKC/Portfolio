import { SOCKET_URL } from './constants.js';

export function createCoTuongOnline({ state, elements, ui, onCellClick }) {

  // ── Socket ────────────────────────────────────────────────
  function connectSocket() {
    return new Promise((resolve, reject) => {
      if (state.socket && state.socket.connected) { resolve(state.socket); return; }
      elements.connectingOverlay.classList.add('active');
      state.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 50000,
        reconnection: true,
        reconnectionAttempts: 5
      });
      const tid = setTimeout(() => {
        elements.connectingOverlay.classList.remove('active');
        reject(new Error('Timeout'));
      }, 50000);
      state.socket.on('connect', () => {
        clearTimeout(tid);
        elements.connectingOverlay.classList.remove('active');
        setupListeners();
        resolve(state.socket);
      });
      state.socket.on('connect_error', err => {
        clearTimeout(tid);
        elements.connectingOverlay.classList.remove('active');
        reject(err);
      });
    });
  }

  function disconnectSocket() {
    ui.stopAiTimer();
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    state.currentRoomCode = null;
    state.isHost = false;
    state.onlinePlayers = [];
    state.isGameOver = false;
  }

  // ── Listeners ─────────────────────────────────────────────
  function setupListeners() {
    if (!state.socket) return;
    state.socket.removeAllListeners();

    // Lobby
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

    // Game start
    state.socket.on('co-tuong-start', ({ board, players, currentTurn, currentTurnIndex, times }) => {
      state.onlinePlayers = players;
      state.currentTurnName = currentTurn;
      state.isGameOver = false;
      state.selectedPiece = null;
      state.validMoves = [];
      state.isAiMode = false;

      const myIdx = players.indexOf(state.myPlayerName);
      state.myColor = myIdx === 0 ? 'r' : 'b';

      if (elements.redNameEl) elements.redNameEl.textContent = players[0];
      if (elements.blackNameEl) elements.blackNameEl.textContent = players[1];
      if (elements.roomBadge) { elements.roomBadge.textContent = `🎮 ${state.currentRoomCode}`; elements.roomBadge.style.display = 'inline-block'; }
      if (elements.historyLog) elements.historyLog.innerHTML = '';

      ui.initBoardState(board);
      ui.buildBoard(onCellClick);
      ui.setupDefs();
      ui.updateTurnUI({ turnPlayerName: currentTurn });
      ui.updatePlayerTimes(times, 0);
      ui.showScreen(elements.playScreen);
    });

    // Move result
    state.socket.on('co-tuong-result', ({ fromRow, fromCol, toRow, toCol, piece, captured, currentTurn, currentTurnIndex, board, times, inCheck }) => {
      ui.clearHighlights();
      ui.applyMove(fromRow, fromCol, toRow, toCol, piece, captured);
      ui.showLastMove(fromRow, fromCol, toRow, toCol);

      // Sync board from server
      state.board = board.map(r => r.map(c => c ? { ...c } : null));
      state.selectedPiece = null;
      state.validMoves = [];
      state.currentTurnName = currentTurn;

      ui.addMoveLog(state.onlinePlayers.find(n => n !== currentTurn) || '?', piece, fromRow, fromCol, toRow, toCol, captured);
      ui.updateTurnUI({ turnPlayerName: currentTurn });
      ui.updatePlayerTimes(times, currentTurnIndex);

      if (inCheck) {
        // find king of next player
        const nextColor = currentTurnIndex === 0 ? 'r' : 'b';
        for (let r = 0; r < 10; r++)
          for (let c = 0; c < 9; c++)
            if (state.board[r][c]?.type === 'K' && state.board[r][c]?.color === nextColor)
              ui.showCheckHighlight(r, c);
      }
    });

    // Timer tick
    state.socket.on('co-tuong-timer-tick', ({ times, idx }) => {
      ui.updatePlayerTimes(times, idx);
    });

    // Game over
    state.socket.on('co-tuong-over', data => {
      state.isGameOver = true;
      setTimeout(() => ui.showWinner(data), 500);
    });

    // Player left
    state.socket.on('player-left', ({ playerName, players, newHost }) => {
      state.onlinePlayers = players;
      state.isHost = newHost === state.myPlayerName;
      if (elements.lobbyScreen.classList.contains('active')) {
        ui.updateLobbyPlayerList(players);
        ui.syncHostControls();
      }
      ui.prependSystemLog(`⚠️ ${playerName} ${ui.getLang() === 'en' ? 'left the room' : 'đã rời phòng'}`);
    });

    // Back to lobby
    state.socket.on('back-to-lobby', ({ players }) => {
      state.onlinePlayers = players;
      state.isGameOver = false;
      ui.showScreen(elements.lobbyScreen);
      elements.lobbyNameStep.style.display = 'none';
      elements.lobbyWaitStep.style.display = 'block';
      ui.updateLobbyPlayerList(players);
      ui.syncHostControls();
    });

    // Disconnect
    state.socket.on('disconnect', () => {
      if (!state.isGameOver && elements.playScreen.classList.contains('active')) {
        alert(ui.getLang() === 'en' ? 'Connection lost!' : 'Mất kết nối!');
        ui.showScreen(elements.lobbyScreen);
        ui.resetLobbyUI();
      }
    });
  }

  // ── Move helpers (client-side for online) ─────────────────
  function emitMove(fromRow, fromCol, toRow, toCol) {
    if (state.isGameOver || !state.socket) return;
    if (state.currentTurnName !== state.myPlayerName) return;
    state.socket.emit('co-tuong-move', { fromRow, fromCol, toRow, toCol });
  }

  return { connectSocket, disconnectSocket, emitMove };
}
