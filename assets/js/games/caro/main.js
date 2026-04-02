import { getCaroElements } from './dom.js';
import { createCaroAiGame } from './ai-game.js';
import { createCaroOnline } from './online-game.js';
import { createCaroState } from './state.js';
import { createCaroUi } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = createCaroState();
  const elements = getCaroElements();
  const ui = createCaroUi({ state, elements });
  let onlineGame;
  let aiGame;

  // ── Shared cell click handler ─────────────────────────────────────────────
  function handleCellClick(row, col) {
    if (state.isAiMode) return; // AI game uses its own handler via ai-game.js
    onlineGame.emitMove(row, col);
  }

  onlineGame = createCaroOnline({ state, elements, ui, onCellClick: handleCellClick });
  ui.resetLobbyUI();

  // ── AI Mode: show difficulty modal ────────────────────────────────────────
  const btnPlayAi = document.getElementById('btnPlayAi');
  const aiSetupModal = document.getElementById('aiSetupModal');
  const btnCloseAiModal = document.getElementById('btnCloseAiModal');
  const difficultyBtns = document.querySelectorAll('.difficulty-btn');
  const btnStartAi = document.getElementById('btnStartAi');
  let selectedDifficulty = 'medium';
  let selectedSymbol = 'X';

  if (btnPlayAi) {
    btnPlayAi.addEventListener('click', () => {
      aiSetupModal.classList.add('active');
    });
  }

  if (btnCloseAiModal) {
    btnCloseAiModal.addEventListener('click', () => aiSetupModal.classList.remove('active'));
  }

  // Difficulty selection
  difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      difficultyBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDifficulty = btn.dataset.difficulty;
    });
  });

  // Symbol selection
  const symbolBtns = document.querySelectorAll('.symbol-btn');
  symbolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      symbolBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSymbol = btn.dataset.symbol;
    });
  });

  if (btnStartAi) {
    btnStartAi.addEventListener('click', () => {
      aiSetupModal.classList.remove('active');
      state.isAiMode = true;
      state.playerSymbol = selectedSymbol;
      state.aiSymbol = selectedSymbol === 'X' ? 'O' : 'X';
      state.difficulty = selectedDifficulty;

      aiGame = createCaroAiGame({ state, elements, ui });
      aiGame.startGame();
    });
  }

  // ── Online Multiplayer ────────────────────────────────────────────────────
  elements.btnCreateRoom.addEventListener('click', async () => {
    const name = elements.onlineNameInput.value.trim();
    if (!name) {
      elements.lobbyStatus.textContent = ui.getLang() === 'en' ? 'Please enter your name' : 'Vui lòng nhập tên';
      elements.lobbyStatus.className = 'status-message error';
      return;
    }

    state.myPlayerName = name;
    state.isAiMode = false;
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
    state.isAiMode = false;
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
    // AI mode restart
    if (state.isAiMode && aiGame) {
      aiGame.restart();
      return;
    }

    // Online mode restart
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

  // Close AI modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aiSetupModal && aiSetupModal.classList.contains('active')) {
      aiSetupModal.classList.remove('active');
    }
  });
});
