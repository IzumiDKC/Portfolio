// ============================================================
//  Minesweeper Multiplayer – Main Client
// ============================================================

const SERVER_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';
const BOARD_SIZE = 10;

let socket = null;
let myName = '';
let roomCode = '';
let isHost = false;
let isMyTurn = false;
let board = [];         // 2D client board state
let gameOver = false;
let myAlive = true;

// ── DOM refs ─────────────────────────────────────────────────
const connectingOverlay = document.getElementById('connectingOverlay');
const lobbyScreen       = document.getElementById('lobbyScreen');
const lobbyNameStep     = document.getElementById('lobbyNameStep');
const lobbyWaitStep     = document.getElementById('lobbyWaitStep');
const playScreen        = document.getElementById('playScreen');
const gameOverScreen    = document.getElementById('gameOverScreen');

const onlineNameInput   = document.getElementById('onlineName');
const btnCreateRoom     = document.getElementById('btnCreateRoom');
const btnShowJoin       = document.getElementById('btnShowJoin');
const btnJoinRoom       = document.getElementById('btnJoinRoom');
const joinRoomGroup     = document.getElementById('joinRoomGroup');
const roomCodeInput     = document.getElementById('roomCodeInput');
const lobbyStatus       = document.getElementById('lobbyStatus');

const roomCodeText      = document.getElementById('roomCodeText');
const btnCopyCode       = document.getElementById('btnCopyCode');
const lobbyPlayerList   = document.getElementById('lobbyPlayerList');
const playerCountLabel  = document.getElementById('playerCountLabel');
const lobbyWaitStatus   = document.getElementById('lobbyWaitStatus');
const btnStartOnline    = document.getElementById('btnStartOnline');
const waitHostMessage   = document.getElementById('waitHostMessage');
const btnLeaveLobby     = document.getElementById('btnLeaveLobby');

const turnIndicator     = document.getElementById('turnIndicator');
const mineCounter       = document.getElementById('mineCounter');
const aliveList         = document.getElementById('aliveList');
const msBoard           = document.getElementById('minesweeper-board');
const historyLog        = document.getElementById('historyLog');
const winnerMessage     = document.getElementById('winnerMessage');
const btnRestart        = document.getElementById('btnRestart');
const eliminatedBanner  = document.getElementById('eliminatedBanner');

// ── Screen switching ─────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name + 'Screen').classList.add('active');
}

// ── Socket connection ─────────────────────────────────────────
function connectSocket() {
  connectingOverlay.classList.add('active');

  socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    connectingOverlay.classList.remove('active');
  });

  socket.on('connect_error', () => {
    // After 5 seconds of failing, hide the overlay so users can still interact with the page
    connectingOverlay.querySelector('p').textContent = 'Không thể kết nối server. Thử lại...';
    setTimeout(() => {
      connectingOverlay.classList.remove('active');
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(239,68,68,0.9);color:#fff;padding:10px 18px;border-radius:8px;font-size:0.9rem;z-index:9000;';
      msg.innerHTML = '<i class="fa-solid fa-wifi" style="margin-right:6px;"></i>Không thể kết nối server';
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 5000);
    }, 5000);
  });

  // ── Room events ─────────────────────────────────────────────
  socket.on('room-created', (data) => {
    roomCode = data.roomCode;
    isHost = true;
    roomCodeText.textContent = roomCode;
    lobbyNameStep.style.display = 'none';
    lobbyWaitStep.style.display = 'block';
    btnStartOnline.style.display = '';
    waitHostMessage.style.display = 'none';
    updateLobbyPlayers(data.players);
    setLobbyStatus('Phòng đã tạo! Chờ người chơi khác...', 'success');
  });

  socket.on('player-joined', (data) => {
    updateLobbyPlayers(data.players);
    btnStartOnline.disabled = (data.players.length < 2);
  });

  socket.on('join-error', (data) => {
    setLobbyStatus(data.message, 'error');
  });

  socket.on('start-error', (data) => {
    setLobbyStatus(data.message, 'error');
  });

  socket.on('back-to-lobby', (data) => {
    gameOver = false;
    myAlive = true;
    isMyTurn = false;
    clearBoard();
    if (eliminatedBanner) eliminatedBanner.style.display = 'none';
    lobbyNameStep.style.display = 'none';
    lobbyWaitStep.style.display = 'block';
    updateLobbyPlayers(data.players);
    btnStartOnline.disabled = (data.players.length < 2);
    showScreen('lobby');
  });

  socket.on('player-left', (data) => {
    if (data.newHost) {
      if (data.newHost === myName) {
        isHost = true;
        btnStartOnline.style.display = '';
        waitHostMessage.style.display = 'none';
      }
    }
    updateLobbyPlayers(data.players);
    addHistory(`🚪 ${data.playerName} đã rời phòng`);
  });

  // ── Game events ──────────────────────────────────────────────
  socket.on('minesweeper-start', (data) => {
    board = data.board;
    gameOver = false;
    myAlive = true;
    if (eliminatedBanner) eliminatedBanner.style.display = 'none';
    clearHistory();
    renderBoard(board);
    updateInfo(data.currentTurn, data.alivePlayers, data.minesRemaining);
    isMyTurn = (data.currentTurn === myName);
    setTurnIndicator(data.currentTurn);
    showScreen('play');
  });

  socket.on('minesweeper-update', (data) => {
    board = data.board;
    applyRevealedCells(data.revealedCells);
    updateInfo(data.currentTurn, data.alivePlayers, data.minesRemaining);
    isMyTurn = (data.currentTurn === myName);
    setTurnIndicator(data.currentTurn);
    if (data.history) updateHistory(data.history);
    animateReveal(data.revealedCells);
  });

  socket.on('minesweeper-flagged', (data) => {
    if (board[data.row] && board[data.row][data.col] !== undefined) {
      board[data.row][data.col].flagged = data.flagged;
    }
    renderBoard(board);
    if (mineCounter) mineCounter.textContent = data.minesRemaining;
  });

  socket.on('minesweeper-eliminated', (data) => {
    board = data.board;
    renderBoard(board);
    updateInfo(data.currentTurn, data.alivePlayers, data.minesRemaining);
    isMyTurn = (data.currentTurn === myName);
    setTurnIndicator(data.currentTurn);
    if (data.history) updateHistory(data.history);

    if (data.eliminatedPlayer === myName) {
      myAlive = false;
      if (eliminatedBanner) {
        eliminatedBanner.style.display = 'flex';
        eliminatedBanner.querySelector('.elim-text').textContent = '💥 Bạn đã trúng mìn và bị loại! Hãy xem đồng đội thi đấu...';
      }
    }

    // Show mine explosion animation
    triggerExplosion(data.row !== undefined ? data.row : null, data.col !== undefined ? data.col : null);
  });

  socket.on('minesweeper-over', (data) => {
    gameOver = true;
    board = data.board;
    renderBoard(board, true);

    if (data.winner === myName) {
      winnerMessage.innerHTML = `🏆 <strong>Bạn thắng!</strong><br><small>Tất cả mìn đã được tìm thấy!</small>`;
    } else if (data.reason === 'all-clear') {
      winnerMessage.innerHTML = `🎉 <strong>${data.winner} chiến thắng!</strong><br><small>Đã dọn sạch tất cả ô mìn!</small>`;
    } else if (data.reason === 'opponent-left') {
      winnerMessage.innerHTML = `🚪 <strong>Đối thủ đã thoát!</strong><br><small>${data.winner} chiến thắng mặc định.</small>`;
    } else {
      winnerMessage.innerHTML = `💣 <strong>${data.winner} chiến thắng!</strong><br><small>${data.loser} đã trúng mìn!</small>`;
    }

    btnRestart.style.display = isHost ? '' : 'none';
    showScreen('gameOver');
  });

  socket.on('not-your-turn', () => {
    setLobbyStatus('Chưa đến lượt bạn!', 'error');
    setTimeout(() => setLobbyStatus('', ''), 1500);
  });
}

// ── Lobby helpers ─────────────────────────────────────────────
function updateLobbyPlayers(players) {
  playerCountLabel.textContent = players.length;
  lobbyPlayerList.innerHTML = players.map((p, i) =>
    `<li>
      <i class="fa-solid fa-user"></i>
      ${p}
      ${i === 0 ? '<span class="host-badge">Chủ</span>' : ''}
    </li>`
  ).join('');
}

function setLobbyStatus(msg, type = '') {
  lobbyStatus.textContent = msg;
  lobbyStatus.className = 'status-message' + (type ? ' ' + type : '');
}

function setLobbyWaitStatus(msg, type = '') {
  lobbyWaitStatus.textContent = msg;
  lobbyWaitStatus.className = 'status-message' + (type ? ' ' + type : '');
}

// ── Board rendering ───────────────────────────────────────────
function renderBoard(boardData, revealAll = false) {
  msBoard.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = boardData[r][c];
      const el = document.createElement('div');
      el.className = 'ms-cell';
      el.dataset.row = r;
      el.dataset.col = c;

      if (cell.revealed) {
        el.classList.add('revealed');
        if (cell.mine) {
          el.classList.add('mine');
          el.innerHTML = '💣';
        } else if (cell.adjacentMines > 0) {
          el.classList.add(`num-${cell.adjacentMines}`);
          el.textContent = cell.adjacentMines;
        }
      } else if (cell.flagged) {
        el.classList.add('flagged');
        el.innerHTML = '🚩';
      }

      if (!gameOver && myAlive && isMyTurn && !cell.revealed && !cell.flagged) {
        el.classList.add('clickable');
      }

      el.addEventListener('click', handleCellClick);
      el.addEventListener('contextmenu', handleCellRightClick);

      msBoard.appendChild(el);
    }
  }
}

function clearBoard() {
  msBoard.innerHTML = '';
  board = [];
}

function applyRevealedCells(cells) {
  cells.forEach(({ row, col, adjacentMines }) => {
    if (board[row]) {
      board[row][col].revealed = true;
      board[row][col].adjacentMines = adjacentMines;
    }
  });
  renderBoard(board);
}

function animateReveal(cells) {
  cells.forEach(({ row, col }) => {
    const idx = row * BOARD_SIZE + col;
    const el = msBoard.children[idx];
    if (el) {
      el.style.animationDelay = `${Math.random() * 0.1}s`;
      el.classList.add('just-revealed');
      setTimeout(() => el && el.classList.remove('just-revealed'), 600);
    }
  });
}

function triggerExplosion(row, col) {
  if (row === null || col === null) return;
  const idx = row * BOARD_SIZE + col;
  const el = msBoard.children[idx];
  if (el) {
    el.classList.add('exploded');
    setTimeout(() => el && el.classList.remove('exploded'), 1000);
  }
}

// ── Interaction ────────────────────────────────────────────────
function handleCellClick(e) {
  if (!isMyTurn || gameOver || !myAlive) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  if (board[row] && board[row][col].revealed) return;
  if (board[row] && board[row][col].flagged) return;
  socket.emit('minesweeper-reveal', { row, col });
}

function handleCellRightClick(e) {
  e.preventDefault();
  if (gameOver) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  if (board[row] && board[row][col].revealed) return;
  socket.emit('minesweeper-flag', { row, col });
}

// ── Info panel ──────────────────────────────────────────────
function updateInfo(currentTurn, alivePlayers, minesRemaining) {
  if (mineCounter) mineCounter.textContent = minesRemaining;
  if (aliveList) {
    aliveList.innerHTML = (alivePlayers || []).map(name =>
      `<span class="alive-chip ${name === myName ? 'me' : ''}">${name === myName ? '🧑 ' + name : '👤 ' + name}</span>`
    ).join('');
  }
}

function setTurnIndicator(name) {
  if (!turnIndicator) return;
  if (name === myName) {
    turnIndicator.textContent = '⚔️ Lượt của bạn! Hãy chọn ô';
    turnIndicator.classList.add('my-turn');
  } else {
    turnIndicator.textContent = `⏳ Lượt của: ${name}`;
    turnIndicator.classList.remove('my-turn');
  }
}

// ── History log ─────────────────────────────────────────────
function addHistory(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  historyLog.prepend(p);
}

function clearHistory() {
  historyLog.innerHTML = '';
}

function updateHistory(histArr) {
  historyLog.innerHTML = '';
  [...histArr].reverse().forEach(msg => {
    const p = document.createElement('p');
    p.textContent = msg;
    historyLog.appendChild(p);
  });
}

// ── Button event listeners ───────────────────────────────────
btnCreateRoom.addEventListener('click', () => {
  myName = onlineNameInput.value.trim();
  if (!myName) { setLobbyStatus('Vui lòng nhập tên!', 'error'); return; }
  socket.emit('create-room', { playerName: myName, gameType: 'minesweeper' });
});

btnShowJoin.addEventListener('click', () => {
  joinRoomGroup.classList.toggle('active');
});

btnJoinRoom.addEventListener('click', () => {
  myName = onlineNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!myName) { setLobbyStatus('Vui lòng nhập tên!', 'error'); return; }
  if (!code) { setLobbyStatus('Vui lòng nhập mã phòng!', 'error'); return; }
  socket.emit('join-room', { roomCode: code, playerName: myName });
  lobbyNameStep.style.display = 'none';
  lobbyWaitStep.style.display = 'block';
  roomCode = code;
  roomCodeText.textContent = roomCode;
  btnStartOnline.style.display = 'none';
  waitHostMessage.style.display = 'block';
});

btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCode);
  btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
  setTimeout(() => { btnCopyCode.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
});

btnStartOnline.addEventListener('click', () => {
  socket.emit('start-game');
});

btnLeaveLobby.addEventListener('click', () => {
  socket.disconnect();
  socket = null;
  location.reload();
});

btnRestart.addEventListener('click', () => {
  if (isHost) socket.emit('play-again');
});

// ── Init ──────────────────────────────────────────────────────
connectSocket();
