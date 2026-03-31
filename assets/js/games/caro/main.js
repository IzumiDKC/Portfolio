import { getCaroElements } from './dom.js';
import { createCaroOnline } from './online-game.js';
import { createCaroState } from './state.js';
import { createCaroUi } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = createCaroState();
  const elements = getCaroElements();
  const ui = createCaroUi({ state, elements });
  let onlineGame;

  function handleCellClick(row, col) {
    onlineGame.emitMove(row, col);
  }

  onlineGame = createCaroOnline({ state, elements, ui, onCellClick: handleCellClick });
  ui.resetLobbyUI();

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
      state.socket.emit('create-room', { playerName: name, gameType: 'caro' });
    } catch (error) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
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
    if (!name || !code || code.length < 4) {
      return;
    }

    state.myPlayerName = name;
    state.currentRoomCode = code;
    localStorage.setItem('onlinePlayerName', name);

    try {
      await onlineGame.connectSocket();
      state.socket.emit('join-room', { roomCode: code, playerName: name });
    } catch (error) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  if (elements.btnBackToSetup) {
    elements.btnBackToSetup.addEventListener('click', () => {
      onlineGame.disconnectSocket();
      ui.resetLobbyUI();
    });
  }

  elements.btnStartOnline.addEventListener('click', () => {
    if (state.isHost && state.socket) {
      state.socket.emit('start-game');
    }
  });

  elements.btnLeaveLobby.addEventListener('click', () => {
    onlineGame.disconnectSocket();
    ui.resetLobbyUI();
  });

  elements.btnCopyCode.addEventListener('click', () => {
    if (!state.currentRoomCode) {
      return;
    }

    navigator.clipboard.writeText(state.currentRoomCode).then(() => {
      const originalHtml = elements.btnCopyCode.innerHTML;
      elements.btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        elements.btnCopyCode.innerHTML = originalHtml;
      }, 2000);
    });
  });

  elements.btnRestart.addEventListener('click', () => {
    if (state.isHost && state.socket) {
      state.socket.emit('play-again');
      return;
    }

    onlineGame.disconnectSocket();
    ui.resetLobbyUI();
    ui.showScreen(elements.lobbyScreen);
  });

  if (elements.langToggleBtn) {
    elements.langToggleBtn.addEventListener('click', () => {
      requestAnimationFrame(() => {
        ui.triggerLangUpdate();
      });
    });
  }
});
