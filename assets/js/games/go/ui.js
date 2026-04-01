import { BOARD_SIZE, PLAYER_TIME } from './constants.js';

export function createGoUi({ state, elements }) {

  // ── Language ──────────────────────────────────────────────
  function getLang() {
    return document.documentElement.getAttribute('data-lang') || 'vi';
  }

  function triggerLangUpdate() {
    const lang = getLang();
    document.querySelectorAll('[data-vi]').forEach((el) => {
      const val = el.getAttribute(`data-${lang}`);
      if (val !== null) el.innerHTML = val;
    });
  }

  // ── Screens ───────────────────────────────────────────────
  function showScreen(screen) {
    [elements.lobbyScreen, elements.playScreen, elements.gameOverScreen]
      .forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ── Lobby UI ──────────────────────────────────────────────
  function resetLobbyUI() {
    elements.lobbyNameStep.style.display = 'block';
    elements.lobbyWaitStep.style.display = 'none';
    elements.joinRoomGroup.classList.remove('active');
    elements.lobbyStatus.textContent = '';
    elements.lobbyStatus.className = 'status-message';
    elements.onlineNameInput.value = localStorage.getItem('onlinePlayerName') || '';
  }

  function updateLobbyPlayerList(players) {
    elements.lobbyPlayerList.innerHTML = '';
    elements.playerCountLabel.textContent = players.length;
    players.forEach((name, index) => {
      const colorLabel = index === 0 ? '⚫ Đen' : '⚪ Trắng';
      const colorLabelEn = index === 0 ? '⚫ Black' : '⚪ White';
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-user"></i> ${name} <span class="badge ${index === 0 ? 'bg-primary' : 'bg-secondary'}" data-vi="${colorLabel}" data-en="${colorLabelEn}">${getLang() === 'en' ? colorLabelEn : colorLabel}</span>`;
      if (index === 0) item.innerHTML += '<span class="host-badge">HOST</span>';
      elements.lobbyPlayerList.appendChild(item);
    });
  }

  function syncHostControls() {
    if (state.isHost) {
      elements.btnStartOnline.style.display = 'flex';
      elements.waitHostMessage.style.display = 'none';
      elements.btnStartOnline.disabled = state.onlinePlayers.length < 2;
    } else {
      elements.btnStartOnline.style.display = 'none';
      elements.waitHostMessage.style.display = 'block';
    }
  }

  // ── Board Rendering ───────────────────────────────────────
  const CELL_SIZE = 44;
  const PADDING = 30;
  const STONE_R = 18;
  // 9x9 standard hoshi points: 4 corners + center
  const STAR_POSITIONS = [
    [2, 2], [2, 6],
    [4, 4],
    [6, 2], [6, 6]
  ];

  let svgEl = null;
  let stonesLayer = null;
  let hoverCircle = null;

  function buildBoard(onCellClick) {
    const size = (BOARD_SIZE - 1) * CELL_SIZE + PADDING * 2;
    const boardWrap = elements.goBoard;

    boardWrap.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('id', 'goBoardSvg');
    svg.style.display = 'block';
    svgEl = svg;

    // Board background rectangle
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', size);
    bg.setAttribute('height', size);
    bg.setAttribute('rx', '6');
    bg.setAttribute('fill', 'var(--go-board-color, #c8a45a)');
    svg.appendChild(bg);

    // Grid lines
    const linesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (let i = 0; i < BOARD_SIZE; i++) {
      const x = PADDING + i * CELL_SIZE;
      const y = PADDING + i * CELL_SIZE;
      const vert = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vert.setAttribute('x1', x); vert.setAttribute('y1', PADDING);
      vert.setAttribute('x2', x); vert.setAttribute('y2', PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
      vert.setAttribute('stroke', 'rgba(0,0,0,0.55)'); vert.setAttribute('stroke-width', '1');
      linesGroup.appendChild(vert);

      const horiz = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horiz.setAttribute('x1', PADDING); horiz.setAttribute('y1', y);
      horiz.setAttribute('x2', PADDING + (BOARD_SIZE - 1) * CELL_SIZE); horiz.setAttribute('y2', y);
      horiz.setAttribute('stroke', 'rgba(0,0,0,0.55)'); horiz.setAttribute('stroke-width', '1');
      linesGroup.appendChild(horiz);
    }
    svg.appendChild(linesGroup);

    // Star points (hoshi)
    STAR_POSITIONS.forEach(([r, c]) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', PADDING + c * CELL_SIZE);
      circle.setAttribute('cy', PADDING + r * CELL_SIZE);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', 'rgba(0,0,0,0.6)');
      svg.appendChild(circle);
    });

    // Coordinate labels (A-J skipping I, 1-9)
    const COLS = 'ABCDEFGHJ';
    for (let i = 0; i < BOARD_SIZE; i++) {
      const colLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      colLabel.setAttribute('x', PADDING + i * CELL_SIZE);
      colLabel.setAttribute('y', PADDING - 8);
      colLabel.setAttribute('text-anchor', 'middle');
      colLabel.setAttribute('font-size', '10');
      colLabel.setAttribute('fill', 'rgba(0,0,0,0.5)');
      colLabel.setAttribute('font-family', 'JetBrains Mono, monospace');
      colLabel.textContent = COLS[i];
      svg.appendChild(colLabel);

      const rowLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rowLabel.setAttribute('x', PADDING - 10);
      rowLabel.setAttribute('y', PADDING + i * CELL_SIZE + 4);
      rowLabel.setAttribute('text-anchor', 'middle');
      rowLabel.setAttribute('font-size', '10');
      rowLabel.setAttribute('fill', 'rgba(0,0,0,0.5)');
      rowLabel.setAttribute('font-family', 'JetBrains Mono, monospace');
      rowLabel.textContent = BOARD_SIZE - i;
      svg.appendChild(rowLabel);
    }

    // Stones layer
    stonesLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(stonesLayer);

    // Hover indicator
    hoverCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hoverCircle.setAttribute('r', STONE_R);
    hoverCircle.setAttribute('fill', 'rgba(255,255,255,0.35)');
    hoverCircle.setAttribute('pointer-events', 'none');
    hoverCircle.style.display = 'none';
    svg.appendChild(hoverCircle);

    // Invisible click/hover areas
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cx = PADDING + col * CELL_SIZE;
        const cy = PADDING + row * CELL_SIZE;
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitArea.setAttribute('x', cx - CELL_SIZE / 2);
        hitArea.setAttribute('y', cy - CELL_SIZE / 2);
        hitArea.setAttribute('width', CELL_SIZE);
        hitArea.setAttribute('height', CELL_SIZE);
        hitArea.setAttribute('fill', 'transparent');
        hitArea.dataset.row = row;
        hitArea.dataset.col = col;
        hitArea.style.cursor = 'pointer';

        hitArea.addEventListener('mouseenter', () => {
          if (state.board[row][col] !== null || state.isGameOver) return;
          if (state.currentTurnName !== state.myPlayerName) return;
          hoverCircle.setAttribute('cx', cx);
          hoverCircle.setAttribute('cy', cy);
          const hoverColor = state.myColor === 'B' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
          hoverCircle.setAttribute('fill', hoverColor);
          hoverCircle.style.display = 'block';
        });

        hitArea.addEventListener('mouseleave', () => {
          hoverCircle.style.display = 'none';
        });

        hitArea.addEventListener('click', () => {
          onCellClick(row, col);
        });

        svg.appendChild(hitArea);
      }
    }

    boardWrap.appendChild(svg);
  }

  function placeStoneUI(row, col, color, isLatest = false) {
    state.board[row][col] = color;
    const cx = PADDING + col * CELL_SIZE;
    const cy = PADDING + row * CELL_SIZE;
    const id = `stone-${row}-${col}`;

    // Remove if exists (should not normally happen)
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);

    // Main stone circle with gradient
    const gradId = `grad-${row}-${col}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('cx', '35%'); grad.setAttribute('cy', '30%');
    grad.setAttribute('r', '60%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color === 'B' ? '#888' : '#fff');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', color === 'B' ? '#111' : '#ccc');
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    g.appendChild(defs);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
    circle.setAttribute('r', STONE_R);
    circle.setAttribute('fill', `url(#${gradId})`);
    circle.setAttribute('stroke', color === 'B' ? '#000' : '#aaa');
    circle.setAttribute('stroke-width', '0.5');
    g.appendChild(circle);

    // Last move marker
    if (isLatest) {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', cx); marker.setAttribute('cy', cy);
      marker.setAttribute('r', '4');
      marker.setAttribute('fill', color === 'B' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)');
      marker.setAttribute('class', 'last-move-marker');
      g.appendChild(marker);
    }

    stonesLayer.appendChild(g);

    // Animate
    g.style.transformOrigin = `${cx}px ${cy}px`;
    g.style.animation = 'stonePlace 0.18s ease-out';
  }

  function removeStoneUI(row, col) {
    state.board[row][col] = null;
    const el = document.getElementById(`stone-${row}-${col}`);
    if (el) el.remove();
  }

  function clearLastMoveMarkers() {
    document.querySelectorAll('.last-move-marker').forEach(m => m.remove());
  }

  // ── Turn Indicator ────────────────────────────────────────
  function updateTurnUI(turnPlayerName) {
    const isMe = turnPlayerName === state.myPlayerName;
    const colorOfTurn = state.onlinePlayers.indexOf(turnPlayerName) === 0 ? '⚫' : '⚪';
    const lang = getLang();

    const viLabel = isMe ? `Lượt của bạn ${colorOfTurn}` : `Lượt của: ${turnPlayerName} ${colorOfTurn}`;
    const enLabel = isMe ? `Your turn ${colorOfTurn}` : `Turn: ${turnPlayerName} ${colorOfTurn}`;

    elements.turnIndicator.setAttribute('data-vi', viLabel);
    elements.turnIndicator.setAttribute('data-en', enLabel);
    elements.turnIndicator.textContent = lang === 'en' ? enLabel : viLabel;
    elements.turnIndicator.style.background = isMe ? 'var(--primary-color)' : '';
    elements.turnIndicator.style.color = isMe ? '#fff' : '';

    // Enable/disable pass & resign
    const myTurn = isMe && !state.isGameOver;
    elements.btnPass.disabled = !myTurn;
    elements.btnResign.disabled = state.isGameOver;

    // Dim board if not my turn
    elements.goBoard.classList.toggle('not-my-turn', !isMe || state.isGameOver);
  }

  // ── Timer UI ──────────────────────────────────────────────
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.max(0, seconds) % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function updatePlayerTimes(playerTimes, currentTurnIndex) {
    if (!playerTimes) return;

    // Update text displays
    if (elements.blackTimeEl) elements.blackTimeEl.textContent = formatTime(playerTimes[0]);
    if (elements.whiteTimeEl) elements.whiteTimeEl.textContent = formatTime(playerTimes[1]);

    // Highlight active player
    if (elements.blackTimeEl) elements.blackTimeEl.classList.toggle('time-active', currentTurnIndex === 0);
    if (elements.whiteTimeEl) elements.whiteTimeEl.classList.toggle('time-active', currentTurnIndex === 1);
    if (elements.blackTimeEl) elements.blackTimeEl.classList.toggle('time-low', playerTimes[0] <= 30);
    if (elements.whiteTimeEl) elements.whiteTimeEl.classList.toggle('time-low', playerTimes[1] <= 30);

    // Ring shows current player's remaining time
    const currentTime = Math.max(0, playerTimes[currentTurnIndex]);
    const pct = currentTime / PLAYER_TIME;
    const r = 18;
    const circ = 2 * Math.PI * r;
    elements.timerRing.style.strokeDasharray = `${circ * pct} ${circ}`;
    elements.timerRing.style.stroke = currentTime <= 30
      ? '#ef4444'
      : currentTime <= 60 ? '#f59e0b' : 'var(--primary-color)';
    elements.timerText.textContent = formatTime(currentTime);
  }

  function stopClientTimer() {
    // No-op: timer is fully server-driven via go-timer-tick events
  }

  // ── Captures & Score ──────────────────────────────────────
  function updateCaptures({ black, white }) {
    elements.blackCaptureCount.textContent = black;
    elements.whiteCaptureCount.textContent = white;
  }

  // ── History Log ───────────────────────────────────────────
  function addMoveLog(playerName, color, row, col) {
    const COLS = 'ABCDEFGHJKLMNOPQRST';
    const coord = `${COLS[col]}${BOARD_SIZE - row}`;
    const colorLabel = color === 'B' ? '⚫' : '⚪';
    const line = document.createElement('p');
    line.innerHTML = getLang() === 'en'
      ? `<span class="fw-bold">${playerName}</span> ${colorLabel} → <span class="text-primary">${coord}</span>`
      : `<span class="fw-bold">${playerName}</span> ${colorLabel} → <span class="text-primary">${coord}</span>`;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  function addPassLog(playerName, autoPass = false) {
    const line = document.createElement('p');
    line.style.fontStyle = 'italic';
    line.style.opacity = '0.75';
    const lang = getLang();
    line.textContent = lang === 'en'
      ? `${playerName} passed${autoPass ? ' (time up)' : ''}`
      : `${playerName} bỏ lượt${autoPass ? ' (hết giờ)' : ''}`;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  function prependSystemLog(message) {
    const line = document.createElement('p');
    line.style.color = '#ef4444';
    line.style.fontStyle = 'italic';
    line.textContent = message;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  // ── Game Over ─────────────────────────────────────────────
  function showWinner({ winner, isDraw, reason, blackScore, whiteScore, blackPlayer, whitePlayer }) {
    stopClientTimer();
    const lang = getLang();
    let winMsg = '';

    if (reason === 'opponent-left') {
      winMsg = lang === 'en' ? `🏆 ${winner} wins! (Opponent left)` : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
    } else if (reason === 'resign') {
      winMsg = lang === 'en' ? `🏆 ${winner} wins by resignation!` : `🏆 ${winner} thắng do đối thủ đầu hàng!`;
    } else if (isDraw) {
      winMsg = lang === 'en' ? '🤝 Draw!' : '🤝 Hòa!';
    } else {
      winMsg = lang === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
    }

    elements.winnerMessage.textContent = winMsg;

    if (reason === 'score' && blackPlayer && whitePlayer) {
      elements.scoreDetails.innerHTML = `
        <div class="score-row">
          <span>⚫ ${blackPlayer}</span>
          <span class="score-val">${blackScore}</span>
        </div>
        <div class="score-row">
          <span>⚪ ${whitePlayer} <em>(+6.5 komi)</em></span>
          <span class="score-val">${whiteScore}</span>
        </div>`;
      elements.scoreDetails.style.display = 'block';
    } else {
      elements.scoreDetails.style.display = 'none';
    }

    const restartSpan = elements.btnRestart.querySelector('span');
    if (restartSpan) {
      if (state.isHost) {
        restartSpan.setAttribute('data-vi', 'Chơi lại');
        restartSpan.setAttribute('data-en', 'Play Again');
        restartSpan.textContent = lang === 'en' ? 'Play Again' : 'Chơi lại';
      } else {
        restartSpan.setAttribute('data-vi', 'Quay về');
        restartSpan.setAttribute('data-en', 'Back to Menu');
        restartSpan.textContent = lang === 'en' ? 'Back to Menu' : 'Quay về';
      }
    }

    showScreen(elements.gameOverScreen);
  }

  return {
    getLang, triggerLangUpdate,
    showScreen,
    resetLobbyUI, updateLobbyPlayerList, syncHostControls,
    buildBoard, placeStoneUI, removeStoneUI, clearLastMoveMarkers,
    updateTurnUI,
    updatePlayerTimes, stopClientTimer,
    updateCaptures,
    addMoveLog, addPassLog, prependSystemLog,
    showWinner
  };
}
