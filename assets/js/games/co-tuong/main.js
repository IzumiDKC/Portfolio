import { getCoTuongElements } from './dom.js';
import { createCoTuongState } from './state.js';
import { createCoTuongUi } from './ui.js';
import { createCoTuongAiGame } from './ai-game.js';
import { createCoTuongOnline } from './online-game.js';
import { ROWS, COLS } from './constants.js';

// ── Client-side move validation (for online mode click handling) ─
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function canPlace(b, r, c, color) {
  if (!inBounds(r, c)) return false;
  const t = b[r][c];
  return !t || t.color !== color;
}

function getRawMoves(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  const moves = [];
  const { type, color } = piece;
  if (type === 'K') {
    const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'A') {
    const [rMin, rMax] = color === 'r' ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = row + dr, nc = col + dc;
      if (nr < rMin || nr > rMax || nc < 3 || nc > 5) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'E') {
    const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
    const blocked = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const rMin = color === 'r' ? 5 : 0;
    const rMax = color === 'r' ? 9 : 4;
    for (let i = 0; i < 4; i++) {
      const nr = row + dirs[i][0], nc = col + dirs[i][1];
      if (!inBounds(nr, nc) || nr < rMin || nr > rMax) continue;
      if (b[row + blocked[i][0]][col + blocked[i][1]]) continue;
      if (canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; }
        moves.push([nr, nc]);
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = row + dr, nc = col + dc, jumped = false;
      while (inBounds(nr, nc)) {
        if (!jumped) { if (b[nr][nc]) jumped = true; else moves.push([nr, nc]); }
        else { if (b[nr][nc]) { if (b[nr][nc].color !== color) moves.push([nr, nc]); break; } }
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'N') {
    const steps = [
      [[-1, 0], [-2, -1]], [[-1, 0], [-2, 1]], [[1, 0], [2, -1]], [[1, 0], [2, 1]],
      [[0, -1], [-1, -2]], [[0, -1], [1, -2]], [[0, 1], [-1, 2]], [[0, 1], [1, 2]]
    ];
    for (const [[lr, lc], [dr, dc]] of steps) {
      const mr = row + lr, mc = col + lc;
      if (!inBounds(mr, mc) || b[mr][mc]) continue;
      const nr = row + dr, nc = col + dc;
      if (inBounds(nr, nc) && canPlace(b, nr, nc, color)) moves.push([nr, nc]);
    }
  } else if (type === 'P') {
    const fwd = color === 'r' ? -1 : 1;
    const crossed = color === 'r' ? row <= 4 : row >= 5;
    if (inBounds(row + fwd, col) && canPlace(b, row + fwd, col, color)) moves.push([row + fwd, col]);
    if (crossed) {
      for (const dc of [-1, 1])
        if (inBounds(row, col + dc) && canPlace(b, row, col + dc, color)) moves.push([row, col + dc]);
    }
  }
  return moves;
}

function cloneBoard(b) { return b.map(r => r.map(c => c ? { ...c } : null)); }

function findKingClient(b, color) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c]?.type === 'K' && b[r][c]?.color === color) return [r, c];
  return null;
}

function isInCheckClient(b, color) {
  const king = findKingClient(b, color);
  if (!king) return true;
  const [kr, kc] = king;
  const opponent = color === 'r' ? 'b' : 'r';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (b[r][c]?.color === opponent && getRawMoves(b, r, c).some(([mr, mc]) => mr === kr && mc === kc)) return true;
  const ok = findKingClient(b, opponent);
  if (ok && ok[1] === kc) {
    const minR = Math.min(kr, ok[0]) + 1, maxR = Math.max(kr, ok[0]);
    if ([...Array(maxR - minR)].every((_, i) => !b[minR + i][kc])) return true;
  }
  return false;
}

function getValidMovesOnline(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  return getRawMoves(b, row, col).filter(([tr, tc]) => {
    const nb = cloneBoard(b);
    nb[tr][tc] = nb[row][col];
    nb[row][col] = null;
    return !isInCheckClient(nb, piece.color);
  });
}

// ── Entry Point ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const state = createCoTuongState();
  const elements = getCoTuongElements();
  const ui = createCoTuongUi({ state, elements });

  let aiGame = null;
  let onlineGame = null;

  ui.resetLobbyUI();
  ui.showScreen(elements.modeScreen);

  // ── Online cell click (for multiplayer) ──────────────────────
  function handleOnlineCellClick(row, col) {
    if (state.isGameOver || state.isAiMode) return;

    const myTurn = state.currentTurnName === state.myPlayerName;
    const clickedPiece = state.board[row][col];
    const sel = state.selectedPiece;

    // Own piece – select/re-select
    if (clickedPiece && clickedPiece.color === state.myColor) {
      if (sel && sel.row === row && sel.col === col) {
        state.selectedPiece = null; state.validMoves = [];
        ui.clearHighlights();
      } else {
        if (!myTurn) return;
        state.selectedPiece = { row, col };
        state.validMoves = getValidMovesOnline(state.board, row, col);
        ui.showHighlights(row, col, state.validMoves);
      }
      return;
    }

    // Drop piece
    if (sel && myTurn) {
      const isValid = state.validMoves.some(([mr, mc]) => mr === row && mc === col);
      if (isValid) {
        onlineGame.emitMove(sel.row, sel.col, row, col);
      }
      state.selectedPiece = null; state.validMoves = [];
      ui.clearHighlights();
    }
  }

  onlineGame = createCoTuongOnline({ state, elements, ui, onCellClick: handleOnlineCellClick });

  // ── Mode Screen ───────────────────────────────────────────────
  elements.btnPlayAi.addEventListener('click', () => {
    elements.aiSetupModal.classList.add('active');
  });

  elements.btnPlayOnline.addEventListener('click', () => {
    ui.showScreen(elements.lobbyScreen);
    ui.resetLobbyUI();
  });

  // ── AI Setup Modal ───────────────────────────────────────────
  elements.btnCloseAiModal.addEventListener('click', () => elements.aiSetupModal.classList.remove('active'));

  let selectedDifficulty = 'medium';
  elements.difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.difficultyBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDifficulty = btn.dataset.difficulty;
    });
  });

  // Side buttons – visual only (player always Red, AI always Black)
  elements.sideBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.sideBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  elements.btnStartAi.addEventListener('click', () => {
    elements.aiSetupModal.classList.remove('active');
    state.isAiMode = true;
    aiGame = createCoTuongAiGame({ state, elements, ui });
    aiGame.startGame(selectedDifficulty);
  });

  // ── Online Lobby ─────────────────────────────────────────────
  elements.btnCreateRoom.addEventListener('click', async () => {
    const name = elements.onlineNameInput.value.trim();
    if (!name) { elements.lobbyStatus.textContent = 'Vui lòng nhập tên'; elements.lobbyStatus.className = 'status-message error'; return; }
    state.myPlayerName = name;
    state.isAiMode = false;
    localStorage.setItem('onlinePlayerName', name);
    try {
      await onlineGame.connectSocket();
      state.socket.emit('create-room', { playerName: name, gameType: 'co-tuong' });
    } catch {
      elements.lobbyStatus.textContent = 'Lỗi kết nối';
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
    if (!name || !code || code.length < 4) return;
    state.myPlayerName = name;
    state.currentRoomCode = code;
    state.isAiMode = false;
    localStorage.setItem('onlinePlayerName', name);
    try {
      await onlineGame.connectSocket();
      state.socket.emit('join-room', { roomCode: code, playerName: name });
    } catch {
      elements.lobbyStatus.textContent = 'Lỗi kết nối';
      elements.lobbyStatus.className = 'status-message error';
    }
  });

  elements.btnLeaveLobby.addEventListener('click', () => {
    onlineGame.disconnectSocket();
    ui.resetLobbyUI();
    ui.showScreen(elements.lobbyScreen);
  });

  elements.btnCopyCode.addEventListener('click', () => {
    if (!state.currentRoomCode) return;
    navigator.clipboard.writeText(state.currentRoomCode).then(() => {
      const orig = elements.btnCopyCode.innerHTML;
      elements.btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { elements.btnCopyCode.innerHTML = orig; }, 2000);
    });
  });

  elements.btnStartOnline.addEventListener('click', () => {
    if (state.isHost && state.socket) state.socket.emit('start-game');
  });

  // ── Resign ────────────────────────────────────────────────────
  elements.btnResign.addEventListener('click', () => {
    if (state.isAiMode && aiGame) { aiGame.resign(); return; }
    if (state.socket) state.socket.emit('go-resign'); // reuse resign event TODO: add co-tuong-resign
  });

  // ── Restart ───────────────────────────────────────────────────
  function doRestart() {
    // Hide overlay if visible
    document.getElementById('gameResultOverlay')?.classList.remove('active');
    if (state.isAiMode && aiGame) { aiGame.restart(); return; }
    if (state.isHost && state.socket) { state.socket.emit('play-again'); return; }
    onlineGame.disconnectSocket();
    ui.showScreen(elements.modeScreen);
  }

  elements.btnRestart.addEventListener('click', doRestart);

  const btnRestartOverlay = document.getElementById('btnRestartOverlay');
  if (btnRestartOverlay) btnRestartOverlay.addEventListener('click', doRestart);

  // ── Language toggle ───────────────────────────────────────────
  if (elements.langToggleBtn) {
    elements.langToggleBtn.addEventListener('click', () => {
      requestAnimationFrame(() => ui.triggerLangUpdate());
    });
  }

  // ── Keyboard: escape closes modal ────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && elements.aiSetupModal?.classList.contains('active'))
      elements.aiSetupModal.classList.remove('active');
  });
});
