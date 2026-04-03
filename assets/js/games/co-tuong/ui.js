import { ROWS, COLS, PLAYER_TIME, PIECE_LABELS, PIECE_NAMES_VI, PIECE_NAMES_EN } from './constants.js';

export function createCoTuongUi({ state, elements }) {

  // ── Language ──────────────────────────────────────────────
  function getLang() {
    return document.documentElement.getAttribute('data-lang') || 'vi';
  }

  function triggerLangUpdate() {
    const lang = getLang();
    document.querySelectorAll('[data-vi]').forEach(el => {
      const val = el.getAttribute(`data-${lang}`);
      if (val !== null) el.innerHTML = val;
    });

    // Rebuild board to ensure accurate scaling if needed (preserve handlers)
    // The main.js language toggle invokes this, so wait for DOM to settle,
    // then redraw if board is currently active.
    if (elements.playScreen.classList.contains('active') && state.board) {
      setTimeout(() => {
        // Redraw board since SVG sizing might be slightly altered by layout changes
        const oldLog = elements.historyLog.innerHTML;
        buildBoard(state.onCellClickHandler); // need to store this or re-bind
        setupDefs();
        renderAllPieces();
        elements.historyLog.innerHTML = oldLog;
      }, 50);
    }
  }

  // ── Screens ───────────────────────────────────────────────
  function showScreen(screen) {
    [elements.modeScreen, elements.lobbyScreen, elements.playScreen, elements.gameOverScreen]
      .filter(Boolean)
      .forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ── Lobby ─────────────────────────────────────────────────
  function resetLobbyUI() {
    if (elements.lobbyNameStep) elements.lobbyNameStep.style.display = 'block';
    if (elements.lobbyWaitStep) elements.lobbyWaitStep.style.display = 'none';
    if (elements.joinRoomGroup) elements.joinRoomGroup.classList.remove('active');
    if (elements.lobbyStatus) { elements.lobbyStatus.textContent = ''; elements.lobbyStatus.className = 'status-message'; }
    if (elements.onlineNameInput) elements.onlineNameInput.value = localStorage.getItem('onlinePlayerName') || '';
  }

  function updateLobbyPlayerList(players) {
    if (!elements.lobbyPlayerList) return;
    elements.lobbyPlayerList.innerHTML = '';
    if (elements.playerCountLabel) elements.playerCountLabel.textContent = players.length;
    players.forEach((name, i) => {
      const colorVI = i === 0 ? '🔴 Đỏ' : '⚫ Đen';
      const colorEN = i === 0 ? '🔴 Red' : '⚫ Black';
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-user"></i> ${name} <span class="badge ${i === 0 ? 'bg-primary' : 'bg-secondary'}" data-vi="${colorVI}" data-en="${colorEN}">${getLang() === 'en' ? colorEN : colorVI}</span>`;
      if (i === 0) item.innerHTML += '<span class="host-badge">HOST</span>';
      elements.lobbyPlayerList.appendChild(item);
    });
  }

  function syncHostControls() {
    if (!elements.btnStartOnline) return;
    if (state.isHost) {
      elements.btnStartOnline.style.display = 'flex';
      if (elements.waitHostMessage) elements.waitHostMessage.style.display = 'none';
      elements.btnStartOnline.disabled = state.onlinePlayers.length < 2;
    } else {
      elements.btnStartOnline.style.display = 'none';
      if (elements.waitHostMessage) elements.waitHostMessage.style.display = 'block';
    }
  }

  // ── Board Rendering ───────────────────────────────────────
  const CELL = 58;
  const PAD = 38;
  const PIECE_R = 24;
  const SVG_W = PAD * 2 + (COLS - 1) * CELL;
  const SVG_H = PAD * 2 + (ROWS - 1) * CELL;

  let svgEl = null;
  let piecesLayer = null;
  let highlightLayer = null;

  function cx(col) { return PAD + (state.myColor === 'b' ? (COLS - 1 - col) : col) * CELL; }
  function cy(row) { return PAD + (state.myColor === 'b' ? (ROWS - 1 - row) : row) * CELL; }

  function buildBoard(onCellClick) {
    const container = elements.boardContainer;
    container.innerHTML = '';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Responsive: use viewBox to define internal coordinates, completely rely on CSS width:100%
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Important: Don't set inline width/height pixels to avoid conflicts with CSS
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svgEl = svg;

    // Board background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', SVG_W); bg.setAttribute('height', SVG_H);
    bg.setAttribute('fill', 'var(--ct-board-color, #f0c070)');
    bg.setAttribute('rx', '8');
    svg.appendChild(bg);

    // Grid lines
    const linesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linesG.setAttribute('stroke', 'var(--ct-line-color, rgba(0,0,0,0.6))');
    linesG.setAttribute('stroke-width', '1');

    for (let r = 0; r < ROWS; r++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx(0)); line.setAttribute('y1', cy(r));
      // Left and right edge columns are full lines; inner columns stop at the river
      line.setAttribute('x2', cx(COLS - 1)); line.setAttribute('y2', cy(r));
      linesG.appendChild(line);
    }
    for (let c = 0; c < COLS; c++) {
      // Vertical lines: split at the river (rows 4-5) for inner columns
      if (c === 0 || c === COLS - 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx(c)); line.setAttribute('y1', cy(0));
        line.setAttribute('x2', cx(c)); line.setAttribute('y2', cy(ROWS - 1));
        linesG.appendChild(line);
      } else {
        // Top half
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        t.setAttribute('x1', cx(c)); t.setAttribute('y1', cy(0));
        t.setAttribute('x2', cx(c)); t.setAttribute('y2', cy(4));
        linesG.appendChild(t);
        // Bottom half
        const bt = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        bt.setAttribute('x1', cx(c)); bt.setAttribute('y1', cy(5));
        bt.setAttribute('x2', cx(c)); bt.setAttribute('y2', cy(9));
        linesG.appendChild(bt);
      }
    }
    svg.appendChild(linesG);

    // River label
    const y4 = cy(4), y5 = cy(5);
    const riverY = (y4 + y5) / 2;
    const riverText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    riverText.setAttribute('x', SVG_W / 2);
    riverText.setAttribute('y', riverY + 6);
    riverText.setAttribute('text-anchor', 'middle');
    riverText.setAttribute('font-size', '18');
    riverText.setAttribute('font-family', 'serif');
    riverText.setAttribute('fill', 'var(--ct-river-text, rgba(0,0,0,0.35))');
    riverText.setAttribute('letter-spacing', '24');
    riverText.textContent = '楚  河         漢  界';
    if (state.myColor === 'b') {
      riverText.setAttribute('transform', `rotate(180 ${SVG_W / 2} ${riverY})`);
    }
    svg.appendChild(riverText);

    // Palace diagonals – Black (top)
    drawPalaceDiagonals(svg, 0, 3);

    // Palace diagonals – Red (bottom)
    drawPalaceDiagonals(svg, 7, 3);

    // Highlight layer (valid moves, selection)
    highlightLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(highlightLayer);

    // Pieces layer
    piecesLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(piecesLayer);

    // Hit areas
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('x', cx(c) - CELL / 2);
        hit.setAttribute('y', cy(r) - CELL / 2);
        hit.setAttribute('width', CELL);
        hit.setAttribute('height', CELL);
        hit.setAttribute('fill', 'transparent');
        hit.style.cursor = 'pointer';
        hit.dataset.row = r;
        hit.dataset.col = c;
        hit.addEventListener('click', () => onCellClick(r, c));
        svg.appendChild(hit);
      }
    }

    container.appendChild(svg);
    renderAllPieces();
  }

  function drawPalaceDiagonals(svg, rStart, cStart) {
    const x1 = cx(cStart), y1 = cy(rStart);
    const x2 = cx(cStart + 2), y2 = cy(rStart + 2);
    const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    d1.setAttribute('x1', x1); d1.setAttribute('y1', y1);
    d1.setAttribute('x2', x2); d1.setAttribute('y2', y2);
    d1.setAttribute('stroke', 'rgba(0,0,0,0.5)'); d1.setAttribute('stroke-width', '1');
    svg.appendChild(d1);
    const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    d2.setAttribute('x1', x2); d2.setAttribute('y1', y1);
    d2.setAttribute('x2', x1); d2.setAttribute('y2', y2);
    d2.setAttribute('stroke', 'rgba(0,0,0,0.5)'); d2.setAttribute('stroke-width', '1');
    svg.appendChild(d2);
  }

  function renderAllPieces() {
    if (!piecesLayer) return;
    piecesLayer.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.board[r][c]) renderPiece(r, c, state.board[r][c]);
      }
    }
  }

  function renderPiece(row, col, piece, animate = false) {
    const id = `piece-${row}-${col}`;
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.dataset.row = row;
    g.dataset.col = col;

    const x = cx(col), y = cy(row);
    const isRed = piece.color === 'r';

    // Outer circle (border ring)
    const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outerCircle.setAttribute('cx', x); outerCircle.setAttribute('cy', y);
    outerCircle.setAttribute('r', PIECE_R + 2);
    outerCircle.setAttribute('fill', isRed ? '#8b1a1a' : '#1a1a2e');
    outerCircle.setAttribute('stroke', isRed ? '#d4a017' : '#4a4a6a');
    outerCircle.setAttribute('stroke-width', '1.5');
    g.appendChild(outerCircle);

    // Inner circle (main body)
    const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    innerCircle.setAttribute('cx', x); innerCircle.setAttribute('cy', y);
    innerCircle.setAttribute('r', PIECE_R);
    innerCircle.setAttribute('fill', isRed ? 'url(#gradRed)' : 'url(#gradBlack)');
    g.appendChild(innerCircle);

    // Inner decorative ring
    const ringCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ringCircle.setAttribute('cx', x); ringCircle.setAttribute('cy', y);
    ringCircle.setAttribute('r', PIECE_R - 4);
    ringCircle.setAttribute('fill', 'none');
    ringCircle.setAttribute('stroke', isRed ? '#d4a017' : '#4a4a6a');
    ringCircle.setAttribute('stroke-width', '1');
    g.appendChild(ringCircle);

    // Text label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y + 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '20');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'serif');
    text.setAttribute('fill', isRed ? '#ffd700' : '#c0c0d0');
    text.setAttribute('pointer-events', 'none');
    text.textContent = PIECE_LABELS[piece.color][piece.type];
    g.appendChild(text);

    if (animate) {
      g.style.transformOrigin = `${x}px ${y}px`;
      g.style.animation = 'piecePlace 0.2s ease-out';
    }

    piecesLayer.appendChild(g);
  }

  function setupDefs() {
    if (!svgEl) return;
    if (document.getElementById('ctGradDefs')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.setAttribute('id', 'ctGradDefs');

    function makeGrad(id, c1, c2) {
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      grad.setAttribute('id', id);
      grad.setAttribute('cx', '35%'); grad.setAttribute('cy', '30%'); grad.setAttribute('r', '65%');
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', c1);
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c2);
      grad.appendChild(s1); grad.appendChild(s2);
      return grad;
    }

    defs.appendChild(makeGrad('gradRed', '#e84040', '#8b1a1a'));
    defs.appendChild(makeGrad('gradBlack', '#404060', 'var(--ct-black, #1a1a2e)'));
    svgEl.insertBefore(defs, svgEl.firstChild);
  }

  // ── Highlights ─────────────────────────────────────────────
  function clearHighlights() {
    if (highlightLayer) highlightLayer.innerHTML = '';
  }

  function showHighlights(selectedRow, selectedCol, moves) {
    clearHighlights();
    // Selected piece highlight
    const selCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    selCircle.setAttribute('cx', cx(selectedCol)); selCircle.setAttribute('cy', cy(selectedRow));
    selCircle.setAttribute('r', PIECE_R + 4);
    selCircle.setAttribute('fill', 'rgba(255,220,0,0.35)');
    selCircle.setAttribute('stroke', '#ffd700');
    selCircle.setAttribute('stroke-width', '2');
    selCircle.setAttribute('stroke-dasharray', '5,3');
    highlightLayer.appendChild(selCircle);

    // Valid move dots
    moves.forEach(([mr, mc]) => {
      const hasPiece = state.board[mr][mc];
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', cx(mc)); dot.setAttribute('cy', cy(mr));
      dot.setAttribute('r', hasPiece ? PIECE_R + 3 : 8);
      dot.setAttribute('fill', hasPiece ? 'rgba(239,68,68,0.3)' : 'rgba(99,240,100,0.5)');
      dot.setAttribute('stroke', hasPiece ? '#ef4444' : '#4ade80');
      dot.setAttribute('stroke-width', hasPiece ? '2.5' : '2');
      if (hasPiece) dot.setAttribute('stroke-dasharray', '4,3');
      highlightLayer.appendChild(dot);
    });
  }

  function showLastMove(fromRow, fromCol, toRow, toCol) {
    // Draw faint arrow / path for last move
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    marker.setAttribute('x1', cx(fromCol)); marker.setAttribute('y1', cy(fromRow));
    marker.setAttribute('x2', cx(toCol)); marker.setAttribute('y2', cy(toRow));
    marker.setAttribute('stroke', 'rgba(255,220,0,0.4)');
    marker.setAttribute('stroke-width', '4');
    marker.setAttribute('stroke-linecap', 'round');
    marker.setAttribute('class', 'last-move-arrow');
    highlightLayer.insertBefore(marker, highlightLayer.firstChild);
  }

  function showCheckHighlight(row, col) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', cx(col)); ring.setAttribute('cy', cy(row));
    ring.setAttribute('r', PIECE_R + 5);
    ring.setAttribute('fill', 'rgba(239,68,68,0.15)');
    ring.setAttribute('stroke', '#ef4444');
    ring.setAttribute('stroke-width', '3');
    ring.setAttribute('class', 'check-ring');
    ring.style.animation = 'checkPulse 0.8s ease-in-out infinite';
    highlightLayer.appendChild(ring);
  }

  // ── Move animation ─────────────────────────────────────────
  function applyMove(fromRow, fromCol, toRow, toCol, pieceData, captured) {
    // Remove captured piece
    const capEl = document.getElementById(`piece-${toRow}-${toCol}`);
    if (capEl) {
      capEl.style.animation = 'pieceCaptured 0.15s ease-in forwards';
      setTimeout(() => capEl.remove(), 150);
    }
    // Remove from source
    const fromEl = document.getElementById(`piece-${fromRow}-${fromCol}`);
    if (fromEl) fromEl.remove();
    // Render at destination
    state.board[fromRow][fromCol] = null;
    state.board[toRow][toCol] = pieceData;
    setTimeout(() => renderPiece(toRow, toCol, pieceData, true), 20);

    // Track captures
    if (captured) updateCapturedDisplay(captured);
  }

  // ── Captured Pieces ────────────────────────────────────────
  const capturedByRed = {};
  const capturedByBlack = {};

  function updateCapturedDisplay(piece) {
    const store = piece.color === 'b' ? capturedByRed : capturedByBlack;
    const el = piece.color === 'b' ? elements.capturedRedEl : elements.capturedBlackEl;
    if (!el) return;
    store[piece.type] = (store[piece.type] || 0) + 1;
    el.textContent = Object.entries(store)
      .map(([t, n]) => `${PIECE_LABELS[piece.color][t]}×${n}`)
      .join(' ');
  }

  function resetCaptured() {
    Object.keys(capturedByRed).forEach(k => delete capturedByRed[k]);
    Object.keys(capturedByBlack).forEach(k => delete capturedByBlack[k]);
    if (elements.capturedRedEl) elements.capturedRedEl.textContent = '';
    if (elements.capturedBlackEl) elements.capturedBlackEl.textContent = '';
  }

  // ── Turn / Timer ───────────────────────────────────────────
  function formatTime(s) {
    s = Math.max(0, s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateTurnUI(opts = {}) {
    if (!elements.turnIndicator) return;
    const { turnPlayerName, isAI, color } = opts;
    const lang = getLang();
    let label;

    if (isAI) {
      const isMyTurn = state.isPlayerTurn;
      const colorIndicator = color === 'r' ? '🔴' : '⚫';
      if (isMyTurn) {
        label = lang === 'en' ? `Your turn ${colorIndicator}` : `Lượt của bạn ${colorIndicator}`;
      } else {
        label = lang === 'en' ? `AI thinking... ${colorIndicator}` : `Máy đang nghĩ... ${colorIndicator}`;
      }
    } else {
      const isMe = turnPlayerName === state.myPlayerName;
      const colorIndicator = state.onlinePlayers.indexOf(turnPlayerName) === 0 ? '🔴' : '⚫';
      label = isMe
        ? (lang === 'en' ? `Your turn ${colorIndicator}` : `Lượt của bạn ${colorIndicator}`)
        : (lang === 'en' ? `${turnPlayerName}'s turn ${colorIndicator}` : `Lượt của ${turnPlayerName} ${colorIndicator}`);
      elements.turnIndicator.style.background = isMe ? 'var(--primary-color)' : '';
      elements.turnIndicator.style.color = isMe ? '#fff' : '';
    }
    elements.turnIndicator.textContent = label;

    // Resign button
    if (elements.btnResign) elements.btnResign.disabled = state.isGameOver;
  }

  function updatePlayerTimes(times, activeIdx) {
    if (!times) return;
    if (elements.redTimeEl) {
      elements.redTimeEl.textContent = formatTime(times[0]);
      elements.redTimeEl.classList.toggle('time-active', activeIdx === 0);
      elements.redTimeEl.classList.toggle('time-low', times[0] <= 30);
    }
    if (elements.blackTimeEl) {
      elements.blackTimeEl.textContent = formatTime(times[1]);
      elements.blackTimeEl.classList.toggle('time-active', activeIdx === 1);
      elements.blackTimeEl.classList.toggle('time-low', times[1] <= 30);
    }

    // Ring
    if (elements.timerRing && elements.timerText) {
      const cur = Math.max(0, times[activeIdx]);
      const pct = cur / PLAYER_TIME;
      const r = 18, circ = 2 * Math.PI * r;
      elements.timerRing.style.strokeDasharray = `${circ * pct} ${circ}`;
      elements.timerRing.style.stroke = cur <= 30 ? '#ef4444' : cur <= 60 ? '#f59e0b' : 'var(--primary-color)';
      elements.timerText.textContent = formatTime(cur);
    }
  }

  // Client-side timer for AI mode
  let aiTimerInterval = null;

  function startAiTimer(activeIdx) {
    stopAiTimer();
    aiTimerInterval = setInterval(() => {
      if (state.playerTimes[activeIdx] > 0) state.playerTimes[activeIdx]--;
      updatePlayerTimes(state.playerTimes, activeIdx);
      if (state.playerTimes[activeIdx] <= 0) {
        stopAiTimer();
        // Timeout in AI mode: player loses
        state.isGameOver = true;
        showWinner({ reason: 'timeout', loser: 'Bạn', winner: 'Máy', isAiMode: true });
      }
    }, 1000);
  }

  function stopAiTimer() {
    if (aiTimerInterval) { clearInterval(aiTimerInterval); aiTimerInterval = null; }
  }

  // ── History Log ────────────────────────────────────────────
  function addMoveLog(playerName, piece, fromRow, fromCol, toRow, toCol, captured) {
    if (!elements.historyLog) return;
    const lang = getLang();
    const colLabels = 'abcdefghi';
    const pieceLabel = PIECE_LABELS[piece.color][piece.type];
    const names = lang === 'en' ? PIECE_NAMES_EN : PIECE_NAMES_VI;
    const from = `${colLabels[fromCol]}${10 - fromRow}`;
    const to = `${colLabels[toCol]}${10 - toRow}`;
    const capStr = captured ? ` (×${PIECE_LABELS[captured.color][captured.type]})` : '';
    const line = document.createElement('p');
    line.innerHTML = `<b>${playerName}</b> ${pieceLabel}(${names[piece.type]}) ${from}→${to}${capStr}`;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  function prependSystemLog(msg) {
    if (!elements.historyLog) return;
    const line = document.createElement('p');
    line.style.color = '#ef4444';
    line.style.fontStyle = 'italic';
    line.textContent = msg;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  // ── Game Over ──────────────────────────────────────────────
  function showWinner({ winner, loser, reason, isDraw, isAiMode }) {
    stopAiTimer();
    const lang = getLang();
    let msg = '';
    const isPlayerWin = isAiMode && winner !== 'Máy' && winner !== 'AI';

    if (reason === 'checkmate') {
      msg = lang === 'en' ? `♟ ${winner} wins by Checkmate!` : `♟ ${winner} thắng bằng chiếu bí!`;
    } else if (reason === 'stalemate') {
      msg = lang === 'en' ? `🤝 Stalemate – Draw!` : `🤝 Hết nước đi – Hòa!`;
    } else if (reason === 'timeout') {
      msg = lang === 'en' ? `⏰ ${winner} wins! (${loser} ran out of time)` : `⏰ ${winner} thắng! (${loser} hết giờ)`;
    } else if (reason === 'resign') {
      msg = lang === 'en' ? `🏳 ${winner} wins by resignation!` : `🏳 ${winner} thắng do đối thủ đầu hàng!`;
    } else if (reason === 'opponent-left') {
      msg = lang === 'en' ? `🏆 ${winner} wins! (Opponent left)` : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
    } else {
      msg = lang === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
    }

    if (elements.winnerMessage) elements.winnerMessage.textContent = msg;

    // Show result overlay ON TOP of play screen (board stays visible)
    const overlay = document.getElementById('gameResultOverlay');
    const msgEl = document.getElementById('gameResultMsg');
    if (overlay && msgEl) {
      msgEl.textContent = msg;
      overlay.dataset.win = isPlayerWin ? 'player' : 'ai';
      overlay.classList.add('active');
    } else {
      showScreen(elements.gameOverScreen);
    }
  }

  // ── Init boards state ──────────────────────────────────────
  function initBoardState(boardData) {
    state.board = boardData.map(row => row.map(c => c ? { ...c } : null));
    resetCaptured();
  }

  return {
    getLang, triggerLangUpdate,
    showScreen,
    resetLobbyUI, updateLobbyPlayerList, syncHostControls,
    buildBoard, setupDefs, renderAllPieces, renderPiece, applyMove,
    clearHighlights, showHighlights, showLastMove, showCheckHighlight,
    initBoardState, resetCaptured, updateCapturedDisplay,
    updateTurnUI, updatePlayerTimes, startAiTimer, stopAiTimer,
    addMoveLog, prependSystemLog,
    showWinner
  };
}
