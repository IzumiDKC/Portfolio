import { SOCKET_URL } from './constants.js';
import { getTienLenElements } from './dom.js';
import { renderCardHTML } from './helpers.js';
import { createTienLenState } from './state.js';
import { createTienLenUi } from './ui.js';

const socket = io(SOCKET_URL);

document.addEventListener('DOMContentLoaded', () => {
  const state = createTienLenState();
  const elements = getTienLenElements();
  const ui = createTienLenUi({ state, elements, socket });

  document.getElementById('btnCreateRoom').addEventListener('click', () => {
    const name = elements.onlineName.value.trim() || 'Player';
    socket.emit('create-room', { playerName: name, gameType: 'tien-len' });
    state.isHost = true;
  });

  document.getElementById('btnShowJoin').addEventListener('click', () => {
    elements.joinRoomGroup.style.display = 'flex';
  });

  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    const name = elements.onlineName.value.trim() || 'Player';
    const code = elements.roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      return;
    }

    state.roomCode = code;
    socket.emit('join-room', { roomCode: code, playerName: name });
    state.isHost = false;
  });

  elements.btnCopyCode.addEventListener('click', () => {
    if (!state.roomCode) {
      return;
    }

    navigator.clipboard.writeText(state.roomCode).then(() => {
      const originalHtml = elements.btnCopyCode.innerHTML;
      elements.btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        elements.btnCopyCode.innerHTML = originalHtml;
      }, 2000);
    });
  });

  socket.on('room-created', ({ roomCode, players }) => {
    state.roomCode = roomCode;
    state.players = players;
    elements.roomCodeText.innerText = roomCode;
    elements.lobbySteps.name.style.display = 'none';
    elements.lobbySteps.wait.style.display = 'block';
    elements.btnStartOnline.style.display = 'inline-flex';
    elements.waitHostMessage.style.display = 'none';
    ui.updateLobbyPlayers();
  });

  socket.on('player-joined', ({ players }) => {
    state.players = players;
    ui.updateLobbyPlayers();

    if (!state.isHost) {
      elements.lobbySteps.name.style.display = 'none';
      elements.lobbySteps.wait.style.display = 'block';
      elements.roomCodeText.innerText = state.roomCode;
      elements.btnStartOnline.style.display = 'none';
      elements.waitHostMessage.style.display = 'block';
      return;
    }

    elements.btnStartOnline.style.display = 'inline-flex';
    elements.waitHostMessage.style.display = 'none';
    elements.btnStartOnline.disabled = state.players.length < 2;
  });

  socket.on('join-error', ({ message }) => {
    elements.lobbyStatus.innerText = message;
    elements.lobbyStatus.style.color = '#ef4444';
  });

  elements.btnStartOnline.addEventListener('click', () => {
    if (state.isHost) {
      socket.emit('start-game');
    }
  });

  socket.on('game-started', () => {
    ui.showScreen('play');
    elements.historyLog.innerHTML = '';
    ui.addLog('Trò chơi bắt đầu! Đang chia bài...', '#22c55e');
  });

  socket.on('tien-len-state', (data) => {
    state.myHand = data.myHand;
    state.currentTurnId = data.turnId;
    state.myId = state.myId || socket.id;

    const me = data.players.find((player) => player.name === elements.onlineName.value.trim() || player.id === socket.id);
    if (me) {
      state.myId = me.id;
    }

    ui.renderHand();
    ui.renderOpponents(data.players);
    ui.renderTable(data.lastMove);
    ui.syncTurnState(data.players, data.lastMove);
  });

  document.getElementById('btnPlaySelected').addEventListener('click', () => {
    if (state.selectedCards.length === 0) {
      return;
    }

    socket.emit('tien-len-move', { cards: state.selectedCards });
  });

  document.getElementById('btnPass').addEventListener('click', () => {
    socket.emit('tien-len-pass');
  });

  socket.on('tien-len-played', ({ playerName, cards }) => {
    ui.addLog(`<b>${playerName}</b> vừa đánh ${cards.length} lá bài.`);
  });

  socket.on('tien-len-new-round', () => {
    ui.addLog('Mọi người bỏ lượt, bắt đầu vòng mới!', '#f59e0b');
    ui.showNewRoundMessage();
  });

  socket.on('play-error', ({ message }) => {
    ui.addLog(`Lỗi: ${message}`, '#ef4444');
    alert(message);
  });

  socket.on('tien-len-winner', ({ winner }) => {
    ui.showScreen('gameOver');
    elements.winnerMessage.innerText = `Người thắng: ${winner} 🏆`;
  });

  document.getElementById('btnRestart').addEventListener('click', () => {
    socket.emit('play-again');
  });

  socket.on('back-to-lobby', ({ players }) => {
    ui.showScreen('lobby');
    elements.lobbySteps.name.style.display = 'none';
    elements.lobbySteps.wait.style.display = 'block';
    state.players = players;
    ui.updateLobbyPlayers();
  });

  socket.on('player-left', ({ playerName }) => {
    ui.addLog(`<b>${playerName}</b> đã rời phòng.`, '#6b7280');
  });

  socket.on('game-ended-disconnect', ({ message }) => {
    ui.showScreen('lobby');
    elements.lobbySteps.name.style.display = 'block';
    elements.lobbySteps.wait.style.display = 'none';
    alert(message);
  });
});
