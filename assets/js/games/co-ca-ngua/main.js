// ══════════════════════════════════════════════════════════════════════════════
//  Cờ Cá Ngựa (Ludo) – Frontend Main Module
// ══════════════════════════════════════════════════════════════════════════════

import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

// ── Constants (must mirror server) ──────────────────────────────────────────
const TRACK_LENGTH = 52;
const FINISH_STEP  = 57;

const START_OFFSETS = { red: 0, blue: 13, yellow: 26, green: 39 };

const MAIN_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0]
];

const HOME_COLS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
  green:  [[13,7],[12,7],[11,7],[10,7],[9,7]]
};

const HOME_POSITIONS = {
  red:    [[1,1],[1,3],[3,1],[3,3]],
  blue:   [[1,11],[1,13],[3,11],[3,13]],
  yellow: [[11,11],[11,13],[13,11],[13,13]],
  green:  [[11,1],[11,3],[13,1],[13,3]]
};

const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const COLOR_NAMES_VI = { red: 'Đỏ', blue: 'Xanh Lam', yellow: 'Vàng', green: 'Xanh Lá' };
const COLOR_HEX      = { red: '#ef4444', blue: '#3b82f6', yellow: '#eab308', green: '#22c55e' };

// ── State ─────────────────────────────────────────────────────────────────────
let socket;
let mySocketId   = null;
let myColor      = null;
let playerName   = '';
let roomCode     = '';
let isHost       = false;
let gameState    = null;  // { pieces, colorMap, colorPlayerMap, activeColors, turnOrder, currentTurnColor }
let validMoves   = [];
let diceRolled   = false;
let currentDice  = null;
let gameOver     = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Screens
const lobbyScreen    = $('lobbyScreen');
const playScreen     = $('playScreen');
const gameOverScreen = $('gameOverScreen');

// Lobby
const nameInput      = $('playerNameInput');
const btnCreate      = $('btnCreateRoom');
const btnShowJoin    = $('btnShowJoin');
const joinGroup      = $('joinRoomGroup');
const roomCodeInput  = $('roomCodeInput');
const btnJoin        = $('btnJoinRoom');
const lobbyStatus    = $('lobbyStatus');
const lobbyNameStep  = $('lobbyNameStep');
const lobbyWaitStep  = $('lobbyWaitStep');
const roomCodeText   = $('roomCodeText');
const btnCopy        = $('btnCopyCode');
const btnStartOnline = $('btnStartOnline');
const waitHostMsg    = $('waitHostMessage');
const playerCountLbl = $('playerCountLabel');
const lobbyPlayerList= $('lobbyPlayerList');
const lobbyWaitStatus= $('lobbyWaitStatus');
const btnLeave       = $('btnLeaveLobby');

// Play screen
const boardEl        = $('ludo-board');
const turnIndicator  = $('turnIndicator');
const playerChips    = $('playerChips');
const diceDisplay    = $('diceDisplay');
const btnRoll        = $('btnRoll');
const historyLog     = $('historyLog');
const gameOverBanner = $('gameOverBanner');
const gobMsg         = $('gobMsg');
const gobSub         = $('gobSub');
const btnPlayAgain   = $('btnPlayAgain');

// Game over screen
const finalRankings  = $('finalRankings');
const btnRestart     = $('btnRestart');
const moveHint       = $('moveHint');

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(name) {
  const screens = {
    lobby:    lobbyScreen,
    play:     playScreen,
    gameover: gameOverScreen
  };
  Object.values(screens).forEach(s => { if (s) s.style.display = 'none'; });
  if (screens[name]) screens[name].style.display = '';
}

function setLobbyStep(step) {
  lobbyNameStep.style.display = step === 'name' ? '' : 'none';
  lobbyWaitStep.style.display = step === 'wait' ? '' : 'none';
}

function setLobbyStatus(msg, type = '') {
  lobbyStatus.textContent = msg;
  lobbyStatus.className = 'status-message' + (type ? ' ' + type : '');
}

// ── Board rendering ───────────────────────────────────────────────────────────

// Build initial 15x15 grid with background zones
function buildBoard() {
  boardEl.innerHTML = '';

  // Color zones keyed by [row,col]
  const homeAreaCells = {
    red:    buildAreaSet([[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[1,0],[1,1],[1,2],[1,3],[1,4],[1,5],[2,0],[2,1],[2,2],[2,3],[2,4],[2,5],[3,0],[3,1],[3,2],[3,3],[3,4],[3,5],[4,0],[4,1],[4,2],[4,3],[4,4],[4,5],[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]]),
    blue:   buildAreaSet([[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[1,9],[1,10],[1,11],[1,12],[1,13],[1,14],[2,9],[2,10],[2,11],[2,12],[2,13],[2,14],[3,9],[3,10],[3,11],[3,12],[3,13],[3,14],[4,9],[4,10],[4,11],[4,12],[4,13],[4,14],[5,9],[5,10],[5,11],[5,12],[5,13],[5,14]]),
    yellow: buildAreaSet([[9,9],[9,10],[9,11],[9,12],[9,13],[9,14],[10,9],[10,10],[10,11],[10,12],[10,13],[10,14],[11,9],[11,10],[11,11],[11,12],[11,13],[11,14],[12,9],[12,10],[12,11],[12,12],[12,13],[12,14],[13,9],[13,10],[13,11],[13,12],[13,13],[13,14],[14,9],[14,10],[14,11],[14,12],[14,13],[14,14]]),
    green:  buildAreaSet([[9,0],[9,1],[9,2],[9,3],[9,4],[9,5],[10,0],[10,1],[10,2],[10,3],[10,4],[10,5],[11,0],[11,1],[11,2],[11,3],[11,4],[11,5],[12,0],[12,1],[12,2],[12,3],[12,4],[12,5],[13,0],[13,1],[13,2],[13,3],[13,4],[13,5],[14,0],[14,1],[14,2],[14,3],[14,4],[14,5]])
  };

  // Home col cells
  const homeColSet = {};
  for (const [color, cells] of Object.entries(HOME_COLS)) {
    for (const [r,c] of cells) {
      homeColSet[`${r},${c}`] = color;
    }
  }

  // Safe set (global indices → convert to [r,c])
  const safeSet = new Set();
  for (const idx of SAFE_SQUARES) {
    const [r,c] = MAIN_PATH[idx];
    safeSet.add(`${r},${c}`);
  }

  // Main path track set
  const mainPathSet = new Set(MAIN_PATH.map(([r,c]) => `${r},${c}`));

  // Start cells (first cell of each color's entry)
  const startCellSet = new Set();
  for (const [color, offset] of Object.entries(START_OFFSETS)) {
    const [r,c] = MAIN_PATH[offset];
    startCellSet.add(`${r},${c}:${color}`);
  }

  const centerCell = '7,7';

  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      const key = `${row},${col}`;

      // Assign zone background
      let homeColor = null;
      for (const [color, set] of Object.entries(homeAreaCells)) {
        if (set.has(key)) { homeColor = color; break; }
      }
      if (homeColor) {
        cell.classList.add('home-area', `home-${homeColor}`);
        // Inner safe circle for piece positions
        if (HOME_POSITIONS[homeColor].some(([r2,c2]) => r2 === row && c2 === col)) {
          cell.classList.add('home-slot');
        }
      } else if (key === centerCell) {
        cell.classList.add('finish-center');
        cell.innerHTML = '<span class="finish-star">★</span>';
      } else if (homeColSet[key]) {
        cell.classList.add('home-col', `home-col-${homeColSet[key]}`);
      } else if (mainPathSet.has(key)) {
        cell.classList.add('track-cell');
        if (safeSet.has(key)) {
          cell.classList.add('safe-cell');
          cell.innerHTML = '<span class="safe-star">★</span>';
        }
      } else {
        cell.classList.add('blank-cell');
      }

      boardEl.appendChild(cell);
    }
  }
}

function buildAreaSet(coords) {
  const s = new Set();
  coords.forEach(([r,c]) => s.add(`${r},${c}`));
  return s;
}

function getCell(color, piece) {
  if (piece.step === -1) {
    const [r,c] = HOME_POSITIONS[color][piece.homeIdx];
    return [r,c];
  }
  if (piece.step === FINISH_STEP) return [7,7];
  if (piece.step >= TRACK_LENGTH) {
    const idx = piece.step - TRACK_LENGTH;
    return HOME_COLS[color][Math.min(idx, 4)];
  }
  const globalIdx = (START_OFFSETS[color] + piece.step) % TRACK_LENGTH;
  return MAIN_PATH[globalIdx];
}

// Render all pieces on the board
function renderPieces(pieces) {
  // Remove old pieces
  boardEl.querySelectorAll('.ludo-piece').forEach(p => p.remove());

  for (const [color, pArr] of Object.entries(pieces)) {
    pArr.forEach((piece, i) => {
      const [row, col] = piece.cell || getCell(color, piece);
      const cellEl = boardEl.querySelector(`.ludo-cell[data-row="${row}"][data-col="${col}"]`);
      if (!cellEl) return;

      const pieceEl = document.createElement('div');
      pieceEl.className = `ludo-piece ludo-piece-${color}`;
      pieceEl.dataset.color = color;
      pieceEl.dataset.idx = i;
      pieceEl.setAttribute('title', `${COLOR_NAMES_VI[color]} #${i+1}`);

      if (validMoves.includes(i) && color === myColor) {
        pieceEl.classList.add('can-move');
        pieceEl.addEventListener('click', () => movePiece(i));
      }

      cellEl.appendChild(pieceEl);
    });
  }
}

// ── Dice overlay ─────────────────────────────────────────────────────────────
const DICE_FACES   = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DICE_NAMES   = ['', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu'];

const diceOverlay     = $('diceOverlay');
const diceOverlayCard = $('diceOverlayCard');
const diceOverlayFace = $('diceOverlayFace');
const diceOverlayLabel= $('diceOverlayLabel');

let overlayTimer = null;

function showDiceOverlay(value, callback) {
  if (!diceOverlay) { if (callback) callback(); return; }

  // Update small display (last result)
  if (diceDisplay) diceDisplay.textContent = DICE_FACES[value] || value;

  // Reset card classes
  diceOverlayCard.className = 'dice-overlay-card dice-val-' + value;
  diceOverlayFace.textContent = DICE_FACES[value] || value;

  const isSpecial = value === 1 || value === 6;
  const label = isSpecial
    ? (value === 6
        ? `🎉 Tung được <strong>6</strong>! Đi thêm lượt!`
        : `🚀 Tung được <strong>1</strong>! Ra quân được!`)
    : `Tung được <strong>${DICE_NAMES[value] || value}</strong>`;
  diceOverlayLabel.innerHTML = label;

  // Show overlay
  clearTimeout(overlayTimer);
  diceOverlay.style.visibility = 'visible';
  diceOverlay.style.opacity    = '1';
  diceOverlay.className = 'dice-overlay show';

  // Hold then hide
  const holdMs = value === 6 ? 1400 : 1100;
  overlayTimer = setTimeout(() => {
    diceOverlay.className = 'dice-overlay hide';
    // After hide animation finishes, fully remove
    setTimeout(() => {
      diceOverlay.className = 'dice-overlay';
      diceOverlay.style.visibility = 'hidden';
      diceOverlay.style.opacity = '0';
      if (callback) callback();
    }, 420);
  }, holdMs);
}

// ── Turn indicator ────────────────────────────────────────────────────────────
function updateTurnIndicator(color, playerNameStr, isMyTurn) {
  if (!turnIndicator) return;
  const colorName = COLOR_NAMES_VI[color] || color;
  const hex = COLOR_HEX[color] || '#6366f1';
  turnIndicator.style.setProperty('--turn-color', hex);
  turnIndicator.textContent = isMyTurn
    ? `✨ Lượt của bạn! (${colorName})`
    : `⏳ Lượt: ${playerNameStr} (${colorName})`;
  turnIndicator.className = 'turn-indicator' + (isMyTurn ? ' my-turn' : '');
  turnIndicator.style.borderColor = hex;
  turnIndicator.style.color       = isMyTurn ? '#fff' : hex;
  turnIndicator.style.background  = isMyTurn
    ? `linear-gradient(135deg, ${hex}cc, ${hex}88)`
    : `rgba(0,0,0,0.05)`;
}

// ── Player chips ──────────────────────────────────────────────────────────────
function renderPlayerChips(state) {
  if (!playerChips) return;
  playerChips.innerHTML = '';
  (state.turnOrder || []).forEach(color => {
    const name = state.colorPlayerMap[color] || color;
    const isMe = (gameState?.colorMap && gameState.colorMap[mySocketId] === color);
    const chip = document.createElement('div');
    chip.className = `player-chip chip-${color}` + (isMe ? ' me' : '');
    chip.style.borderColor = COLOR_HEX[color];
    chip.style.setProperty('--chip-color', COLOR_HEX[color]);
    const finished = state.finishedColors?.includes(color);
    chip.innerHTML = `
      <span class="chip-dot" style="background:${COLOR_HEX[color]}"></span>
      <span class="chip-name">${name}${isMe ? ' (bạn)' : ''}${finished ? ' 🏁' : ''}</span>
    `;
    playerChips.appendChild(chip);
  });
}

// ── Roll button state ─────────────────────────────────────────────────────────
function refreshRollBtn() {
  const isMyTurn = (gameState && myColor && gameState.currentTurnColor === myColor);
  if (btnRoll) {
    btnRoll.disabled = !isMyTurn || diceRolled || gameOver;
    btnRoll.classList.toggle('active-turn', isMyTurn && !diceRolled && !gameOver);
  }
}

// ── History log ───────────────────────────────────────────────────────────────
function pushLog(msg) {
  if (!historyLog) return;
  const item = document.createElement('div');
  item.className = 'log-entry';
  item.textContent = msg;
  historyLog.prepend(item);
  while (historyLog.children.length > 30) historyLog.lastChild.remove();
}

function setLog(msgs) {
  if (!historyLog) return;
  historyLog.innerHTML = '';
  (msgs || []).slice().reverse().forEach(m => {
    const item = document.createElement('div');
    item.className = 'log-entry';
    item.textContent = m;
    historyLog.appendChild(item);
  });
}

// ── Move piece ────────────────────────────────────────────────────────────────
function movePiece(idx) {
  if (!diceRolled || gameOver) return;
  socket.emit('co-ca-ngua-move', { pieceIndex: idx });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Socket.IO setup
// ══════════════════════════════════════════════════════════════════════════════
function initSocket() {
  const SERVER_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : window.location.origin;

  socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    mySocketId = socket.id;
    const overlay = $('connectingOverlay');
    if (overlay) overlay.style.display = 'none';
    console.log('[WS] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('[WS] Disconnected');
  });

  // ── Room events ───────────────────────────────────────────────────────────
  socket.on('room-created', ({ roomCode: rc, players }) => {
    roomCode = rc;
    isHost   = true;
    roomCodeText.textContent = rc;
    setLobbyStep('wait');
    updateLobbyPlayers(players);
    lobbyWaitStatus.textContent = '';
    btnStartOnline.disabled = players.length < 2;
    waitHostMsg.style.display = 'none';
    btnStartOnline.style.display = '';
  });

  socket.on('player-joined', ({ players }) => {
    updateLobbyPlayers(players);
    btnStartOnline.disabled = players.length < 2;
    lobbyWaitStatus.textContent = players.length < 2
      ? 'Cần ít nhất 2 người chơi...'
      : `Sẵn sàng! (${players.length}/4 người)`;
  });

  socket.on('join-error', ({ message }) => {
    // Revert to name step if join failed
    setLobbyStep('name');
    setLobbyStatus('❌ ' + message, 'error');
  });

  socket.on('start-error', ({ message }) => {
    setLobbyStatus('❌ ' + message, 'error');
  });

  socket.on('player-left', ({ playerName: pn, players, newHost }) => {
    if (lobbyWaitStep.style.display !== 'none') {
      updateLobbyPlayers(players);
      lobbyWaitStatus.textContent = `${pn} đã rời phòng.`;
      btnStartOnline.disabled = players.length < 2;
    }
    pushLog(`🚪 ${pn} đã rời phòng`);
  });

  socket.on('back-to-lobby', ({ players }) => {
    gameOver = false;
    diceRolled = false;
    validMoves = [];
    gameState = null;
    currentDice = null;
    diceDisplay.textContent = '🎲';
    if (gameOverBanner) gameOverBanner.style.display = 'none';
    showScreen('lobby');
    setLobbyStep('wait');
    updateLobbyPlayers(players);
    btnStartOnline.disabled = players.length < 2;
    lobbyWaitStatus.textContent = '';
    if (!isHost) {
      btnStartOnline.style.display = 'none';
      waitHostMsg.style.display = '';
    }
  });

  // ── Game events ───────────────────────────────────────────────────────────
  socket.on('co-ca-ngua-start', (data) => {
    gameState   = data;
    myColor     = data.colorMap[mySocketId] || null;
    validMoves  = [];
    diceRolled  = false;
    gameOver    = false;
    currentDice = null;

    showScreen('play');
    if (gameOverBanner) gameOverBanner.style.display = 'none';
    buildBoard();
    renderPieces(data.pieces);
    renderPlayerChips(data);
    updateTurnIndicator(
      data.currentTurnColor,
      data.colorPlayerMap[data.currentTurnColor],
      data.currentTurnColor === myColor
    );
    refreshRollBtn();
    diceDisplay.textContent = '🎲';
    historyLog.innerHTML = '';
    pushLog('🎮 Game bắt đầu! Chúc vui vẻ!');
  });

  socket.on('co-ca-ngua-rolled', (data) => {
    const { dice, validMoves: vm, currentTurnColor, currentTurnPlayer, forcedSkip, reason } = data;
    currentDice = dice;

    showDiceOverlay(dice, () => {
      if (forcedSkip) {
        diceRolled = false;
        validMoves = [];
        if (moveHint) moveHint.textContent = '';
        const prevColor = gameState.currentTurnColor;
        gameState = { ...gameState, currentTurnColor, currentTurnPlayer };
        if (reason === 'three-sixes') {
          pushLog(`🚫 ${gameState.colorPlayerMap?.[prevColor] || prevColor} tung 6 ba lần – mất lượt!`);
        } else {
          pushedLogForSkip(prevColor, dice);
        }
        renderPieces(gameState.pieces);
        updateTurnIndicator(currentTurnColor, data.currentTurnPlayer, currentTurnColor === myColor);
        refreshRollBtn();
      } else {
        diceRolled = true;
        validMoves = vm;
        // Always re-render so can-move highlights appear for the active player
        renderPieces(gameState.pieces);
        if (moveHint) {
          moveHint.textContent = vm.length > 0 && currentTurnColor === myColor
            ? '👆 Click vào quân sáng để di chuyển!'
            : '';
        }
        refreshRollBtn();
      }
    });
  });

  socket.on('co-ca-ngua-moved', (data) => {
    const { pieces, currentTurnColor, currentTurnPlayer, eaten, dice, extraTurn, finishedColors, history } = data;
    diceRolled  = false;
    validMoves  = [];
    if (moveHint) moveHint.textContent = '';
    gameState   = { ...gameState, pieces, currentTurnColor, finishedColors };

    renderPieces(pieces);
    renderPlayerChips({ ...gameState, colorPlayerMap: gameState.colorPlayerMap, finishedColors });
    updateTurnIndicator(currentTurnColor, currentTurnPlayer, currentTurnColor === myColor);
    refreshRollBtn();

    if (history && history.length) {
      // show latest entry
      pushLog(history[history.length - 1]);
    }

    if (eaten && eaten.length > 0 && eaten.some(e => e.color === myColor)) {
      pushLog('💥 Quân của bạn bị ăn và về chuồng!');
    }
  });

  socket.on('co-ca-ngua-over', (data) => {
    gameOver   = true;
    diceRolled = false;
    validMoves = [];
    refreshRollBtn();

    if (data.pieces) renderPieces(data.pieces);

    const { rankings, reason } = data;
    const myRank = rankings.find(r => r.color === myColor);
    const winnerName = rankings[0]?.playerName || '???';

    if (reason === 'opponent-left') {
      gobMsg.textContent = '🚪 Đối thủ đã rời phòng!';
      gobSub.textContent = rankings[0]?.playerName === (gameState?.colorPlayerMap?.[myColor]) ? 'Bạn thắng mặc định!' : `${winnerName} thắng mặc định.`;
    } else if (myRank?.rank === 1) {
      gobMsg.textContent = '🏆 Chúc mừng! Bạn thắng!';
      gobSub.textContent = 'Bạn đã đưa tất cả 4 quân về đích!';
    } else {
      gobMsg.textContent = `🏁 ${winnerName} về đích đầu tiên!`;
      gobSub.textContent = myRank ? `Bạn xếp hạng #${myRank.rank}` : 'Game kết thúc.';
    }

    if (gameOverBanner) gameOverBanner.style.display = '';
    btnPlayAgain.style.display = isHost ? '' : 'none';

    // Also fill game-over screen
    if (finalRankings && rankings) {
      finalRankings.innerHTML = '';
      rankings.forEach(r => {
        const li = document.createElement('div');
        li.className = 'ranking-item';
        li.innerHTML = `
          <span class="rank-badge" style="background:${COLOR_HEX[r.color]}20;color:${COLOR_HEX[r.color]};border-color:${COLOR_HEX[r.color]}44">
            #${r.rank}
          </span>
          <span class="rank-piece" style="background:${COLOR_HEX[r.color]}"></span>
          <span class="rank-name">${r.playerName} (${COLOR_NAMES_VI[r.color]})</span>
        `;
        finalRankings.appendChild(li);
      });
    }
  });
}

function pushedLogForSkip(color, dice) {
  const name = gameState?.colorPlayerMap?.[color] || color;
  pushLog(`⏭️ ${name} không có nước đi (tung ${dice}) – bỏ lượt`);
}

// ── Lobby helpers ─────────────────────────────────────────────────────────────
function updateLobbyPlayers(players) {
  playerCountLbl.textContent = players.length;
  lobbyPlayerList.innerHTML = '';
  players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'lobby-player-item';
    li.innerHTML = `<i class="fa-solid fa-user"></i> ${p}${i === 0 ? ' <span class="host-badge">👑 Host</span>' : ''}`;
    lobbyPlayerList.appendChild(li);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Event Listeners (Lobby)
// ══════════════════════════════════════════════════════════════════════════════
btnCreate.addEventListener('click', () => {
  playerName = nameInput.value.trim();
  if (!playerName) { setLobbyStatus('Vui lòng nhập tên!', 'error'); return; }
  setLobbyStatus('');
  socket.emit('create-room', { playerName, gameType: 'co-ca-ngua' });
});

btnShowJoin.addEventListener('click', () => {
  joinGroup.classList.toggle('active');
});

btnJoin.addEventListener('click', () => {
  playerName = nameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!playerName) { setLobbyStatus('Vui lòng nhập tên!', 'error'); return; }
  if (!code)       { setLobbyStatus('Vui lòng nhập mã phòng!', 'error'); return; }
  setLobbyStatus('');
  socket.emit('join-room', { roomCode: code, playerName });
  // Optimistically show wait step (will revert on join-error)
  roomCode = code;
  roomCodeText.textContent = code;
  setLobbyStep('wait');
  btnStartOnline.style.display = 'none';
  waitHostMsg.style.display = '';
  isHost = false;
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnCreate.click();
});

roomCodeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnJoin.click();
});

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeText.textContent);
  btnCopy.innerHTML = '<i class="fa-solid fa-check"></i>';
  setTimeout(() => { btnCopy.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
});

btnStartOnline.addEventListener('click', () => {
  socket.emit('start-game');
});

btnLeave.addEventListener('click', () => {
  location.reload();
});

// ── Play screen events ────────────────────────────────────────────────────────
btnRoll.addEventListener('click', () => {
  if (diceRolled || gameOver) return;
  socket.emit('co-ca-ngua-roll');
});

btnPlayAgain.addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('play-again');
});

btnRestart && btnRestart.addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('play-again');
});

// ══════════════════════════════════════════════════════════════════════════════
//  Boot
// ══════════════════════════════════════════════════════════════════════════════
showScreen('lobby');
setLobbyStep('name');
initSocket();
