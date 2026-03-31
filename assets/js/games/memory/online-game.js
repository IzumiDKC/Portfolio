import { SOCKET_URL } from './constants.js';

export function createMemoryOnline({ state, elements, ui, onCardClick }) {
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

    state.socket.on('game-started', ({ gameType, currentTurn, scores, hints, boardSize, columns, rows }) => {
      if (gameType !== 'memory') return;

      state.currentTurnName = currentTurn;
      state.isGameOver = false;
      elements.historyLog.innerHTML = '';
      ui.initClientBoard(onCardClick, boardSize, columns, rows);
      ui.updateOnlineTurnUI(currentTurn);
      ui.updateScoresUI(scores, hints);
      ui.startTimerBar(15000); // 15s turn
      
      elements.roomBadge.textContent = `🎮 ${state.currentRoomCode}`;
      elements.roomBadge.style.display = 'inline-block';
      ui.showScreen(elements.playScreen);
    });

    state.socket.on('turn-updated', ({ currentTurn, turnDuration, hints }) => {
      state.currentTurnName = currentTurn;
      ui.updateOnlineTurnUI(currentTurn);
      
      if (hints) {
        // Just to sync up if any change
        const dummyScores = {}; // We skip rewriting scores if we just pass hints
        // Actually, better to just let UI sync if needed, but it's okay, let's keep it simple.
        // It's mainly updateScoresUI that draws the hints
      }
      
      ui.startTimerBar(turnDuration || 15000);
    });

    state.socket.on('memory-card-flipped', ({ cardIndex, emoji }) => {
      ui.flipCard(cardIndex, emoji);
    });

    state.socket.on('memory-match', ({ firstIndex, secondIndex, scorer, scores, hints }) => {
      ui.markMatched(firstIndex, secondIndex);
      ui.updateScoresUI(scores, hints);
      ui.addLog(scorer, ui.getLang() === 'en' ? 'found a match!' : 'đã tìm thấy 1 cặp!');
    });

    state.socket.on('memory-unflip', ({ firstIndex, secondIndex }) => {
      ui.unflipCards(firstIndex, secondIndex);
    });

    state.socket.on('game-ended', ({ winner, status }) => {
      state.isGameOver = true;
      setTimeout(() => {
        ui.showWinner({ winner, status });
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

  function emitFlip(cardIndex) {
    if (state.isGameOver || !state.socket || state.currentTurnName !== state.myPlayerName) return;

    const card = elements.memoryBoard.children[cardIndex];
    if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

    state.socket.emit('memory-flip', { cardIndex });
  }

  function emitUseHint() {
    if (state.isGameOver || !state.socket || state.currentTurnName !== state.myPlayerName) return;
    state.socket.emit('memory-use-hint');
  }

  return {
    connectSocket,
    disconnectSocket,
    emitFlip,
    emitUseHint
  };
}
