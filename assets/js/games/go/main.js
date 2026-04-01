import { getGoElements } from './dom.js';
import { createGoOnline } from './online-game.js';
import { createGoState } from './state.js';
import { createGoUi } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = createGoState();
  const elements = getGoElements();
  const ui = createGoUi({ state, elements });
  let onlineGame;

  function handleCellClick(row, col) {
    onlineGame.emitMove(row, col);
  }

  onlineGame = createGoOnline({ state, elements, ui, onCellClick: handleCellClick });
  ui.resetLobbyUI();

  // ── Create Room ──────────────────────────────────────────
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
      state.socket.emit('create-room', { playerName: name, gameType: 'go' });
    } catch {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  // ── Show Join Panel ──────────────────────────────────────
  elements.btnShowJoin.addEventListener('click', () => {
    elements.joinRoomGroup.classList.toggle('active');
    elements.roomCodeInput.focus();
  });

  // ── Join Room ────────────────────────────────────────────
  elements.btnJoinRoom.addEventListener('click', async () => {
    const name = elements.onlineNameInput.value.trim();
    const code = elements.roomCodeInput.value.trim().toUpperCase();
    if (!name || !code || code.length < 4) return;

    state.myPlayerName = name;
    state.currentRoomCode = code;
    localStorage.setItem('onlinePlayerName', name);
    try {
      await onlineGame.connectSocket();
      state.socket.emit('join-room', { roomCode: code, playerName: name });
    } catch {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  // ── Start Game ───────────────────────────────────────────
  elements.btnStartOnline.addEventListener('click', () => {
    if (state.isHost && state.socket) {
      state.socket.emit('start-game');
    }
  });

  // ── Leave Lobby ──────────────────────────────────────────
  elements.btnLeaveLobby.addEventListener('click', () => {
    onlineGame.disconnectSocket();
    ui.resetLobbyUI();
    ui.showScreen(elements.lobbyScreen);
  });

  // ── Copy Room Code ───────────────────────────────────────
  elements.btnCopyCode.addEventListener('click', () => {
    if (!state.currentRoomCode) return;
    navigator.clipboard.writeText(state.currentRoomCode).then(() => {
      const orig = elements.btnCopyCode.innerHTML;
      elements.btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { elements.btnCopyCode.innerHTML = orig; }, 2000);
    });
  });

  // ── Pass ─────────────────────────────────────────────────
  elements.btnPass.addEventListener('click', () => {
    const lang = ui.getLang();
    const confirmMsg = lang === 'en'
      ? 'Are you sure you want to pass your turn?'
      : 'Bạn có chắc muốn bỏ lượt không?';
    if (confirm(confirmMsg)) {
      onlineGame.emitPass();
    }
  });

  // ── Resign ───────────────────────────────────────────────
  elements.btnResign.addEventListener('click', () => {
    const lang = ui.getLang();
    const confirmMsg = lang === 'en'
      ? 'Are you sure you want to resign?'
      : 'Bạn có chắc muốn đầu hàng không?';
    if (confirm(confirmMsg)) {
      onlineGame.emitResign();
    }
  });

  // ── Play Again / Back ────────────────────────────────────
  elements.btnRestart.addEventListener('click', () => {
    if (state.isHost && state.socket) {
      state.socket.emit('play-again');
    } else {
      onlineGame.disconnectSocket();
      ui.resetLobbyUI();
      ui.showScreen(elements.lobbyScreen);
    }
  });

  // ── Language toggle ───────────────────────────────────────
  if (elements.langToggleBtn) {
    elements.langToggleBtn.addEventListener('click', () => {
      requestAnimationFrame(() => ui.triggerLangUpdate());
    });
  }
});
