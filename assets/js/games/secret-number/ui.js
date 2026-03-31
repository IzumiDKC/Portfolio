export function createUi({ state, elements }) {
  function getLang() {
    return document.documentElement.getAttribute('data-lang') || 'vi';
  }

  function showScreen(screen) {
    [elements.setupScreen, elements.playScreen, elements.gameOverScreen, elements.lobbyScreen]
      .forEach((item) => item.classList.remove('active'));
    screen.classList.add('active');
  }

  function triggerLangUpdate(lang) {
    document.querySelectorAll('[data-vi]').forEach((element) => {
      const value = element.getAttribute(`data-${lang}`);
      if (value !== null) {
        element.innerHTML = value;
      }
    });
  }

  function updateRangeUI() {
    elements.minValSpan.textContent = state.minRange;
    elements.maxValSpan.textContent = state.maxRange;
    elements.rangeDisplay.classList.remove('pop');
    void elements.rangeDisplay.offsetWidth;
    elements.rangeDisplay.classList.add('pop');
    setTimeout(() => {
      elements.rangeDisplay.classList.remove('pop');
    }, 300);
  }

  function updateTurnUI() {
    const viLabel = state.mode === 'bot' && state.currentPlayer === 2
      ? 'Máy (Bot)'
      : (state.mode === 'bot' && state.currentPlayer === 1 ? 'Bạn' : `Người chơi ${state.currentPlayer}`);
    const enLabel = state.mode === 'bot' && state.currentPlayer === 2
      ? 'Bot'
      : (state.mode === 'bot' && state.currentPlayer === 1 ? 'You' : `Player ${state.currentPlayer}`);

    elements.turnIndicator.setAttribute('data-vi', `Lượt của: ${viLabel}`);
    elements.turnIndicator.setAttribute('data-en', `Turn: ${enLabel}`);
    elements.turnIndicator.textContent = getLang() === 'en' ? `Turn: ${enLabel}` : `Lượt của: ${viLabel}`;
    elements.turnIndicator.style.background = state.mode === 'bot' && state.currentPlayer === 2
      ? 'var(--text-color)'
      : 'var(--primary-color)';
    elements.turnIndicator.style.color = state.mode === 'bot' && state.currentPlayer === 2
      ? 'var(--bg-color)'
      : '#ffffff';
  }

  function updateOnlineTurnUI(turnPlayerName) {
    const isMe = turnPlayerName === state.myPlayerName;
    const viLabel = isMe ? `Lượt của bạn (${turnPlayerName})` : `Lượt của: ${turnPlayerName}`;
    const enLabel = isMe ? `Your turn (${turnPlayerName})` : `Turn: ${turnPlayerName}`;
    elements.turnIndicator.setAttribute('data-vi', viLabel);
    elements.turnIndicator.setAttribute('data-en', enLabel);
    elements.turnIndicator.textContent = getLang() === 'en' ? enLabel : viLabel;
    elements.turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
    elements.turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
  }

  function addLog(playerNum, guessVal, isUp, isAFK = false, playerNameOverride = null) {
    const line = document.createElement('p');
    const lang = getLang();
    let playerVi;
    let playerEn;

    if (playerNameOverride) {
      playerVi = playerNameOverride;
      playerEn = playerNameOverride;
    } else {
      playerVi = playerNum === 1
        ? (state.mode === 'bot' ? 'Bạn' : 'Người chơi 1')
        : (state.mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${playerNum}`);
      playerEn = playerNum === 1
        ? (state.mode === 'bot' ? 'You' : 'Player 1')
        : (state.mode === 'bot' ? 'Bot' : `Player ${playerNum}`);
    }

    const guessHtml = `<span style="color:var(--primary-color);font-weight:900;">${guessVal}</span>`;
    const actionVi = isAFK
      ? `quá 10s không nhập, hệ thống tự động chọn ${guessHtml} và phạt mất 1 lượt sau đó`
      : `đoán ${guessHtml}`;
    const actionEn = isAFK
      ? `was AFK > 10s, system auto-picked ${guessHtml}. Penalized 1 turn`
      : `guessed ${guessHtml}`;
    const viHtml = `${playerVi} ${actionVi}. ${isUp ? 'Đã nâng giới hạn dưới.' : 'Đã giảm giới hạn trên.'}`;
    const enHtml = `${playerEn} ${actionEn}. ${isUp ? 'Increased lower bound.' : 'Decreased upper bound.'}`;

    line.setAttribute('data-vi', viHtml);
    line.setAttribute('data-en', enHtml);
    line.innerHTML = lang === 'en' ? enHtml : viHtml;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  function prependSystemMessage(message) {
    const line = document.createElement('p');
    line.style.color = '#ef4444';
    line.style.fontStyle = 'italic';
    line.textContent = message;
    if (elements.historyLog.firstChild) {
      elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
    }
  }

  function endGame(winningPlayerNum, correctNumber, winnerNameOverride = null) {
    state.isGameOver = true;
    showScreen(elements.gameOverScreen);
    let playerVi;
    let playerEn;

    if (winnerNameOverride) {
      playerVi = winnerNameOverride;
      playerEn = winnerNameOverride;
    } else {
      playerVi = winningPlayerNum === 1
        ? (state.mode === 'bot' ? 'Bạn' : 'Người chơi 1')
        : (state.mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${winningPlayerNum}`);
      playerEn = winningPlayerNum === 1
        ? (state.mode === 'bot' ? 'You' : 'Player 1')
        : (state.mode === 'bot' ? 'Bot' : `Player ${winningPlayerNum}`);
    }

    const winVi = `🎉 ${playerVi} chiến thắng!`;
    const winEn = `🎉 ${playerEn} wins!`;
    elements.winnerMessage.setAttribute('data-vi', winVi);
    elements.winnerMessage.setAttribute('data-en', winEn);
    elements.winnerMessage.textContent = getLang() === 'en' ? winEn : winVi;
    elements.secretNumberDisplay.textContent = correctNumber;
  }

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
    players.forEach((name, index) => {
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-user"></i> ${name}`;
      if (index === 0) {
        item.innerHTML += '<span class="host-badge">HOST</span>';
      }
      elements.lobbyPlayerList.appendChild(item);
    });
  }

  function setPlayInputEnabled(enabled) {
    elements.guessInput.disabled = !enabled;
    elements.btnGuess.disabled = !enabled;
    if (enabled) {
      elements.guessInput.focus();
    }
  }

  return {
    addLog,
    endGame,
    getLang,
    prependSystemMessage,
    resetLobbyUI,
    setPlayInputEnabled,
    showScreen,
    triggerLangUpdate,
    updateLobbyPlayerList,
    updateOnlineTurnUI,
    updateRangeUI,
    updateTurnUI
  };
}
