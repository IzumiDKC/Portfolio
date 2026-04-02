import { BOARD_SIZE } from './constants.js';

export function createCaroUi({ state, elements }) {
  function getLang() {
    return document.documentElement.getAttribute('data-lang') || 'vi';
  }

  function showScreen(screen) {
    [elements.lobbyScreen, elements.playScreen, elements.gameOverScreen]
      .forEach((item) => item.classList.remove('active'));
    screen.classList.add('active');
  }

  function triggerLangUpdate() {
    const lang = getLang();
    document.querySelectorAll('[data-vi]').forEach((element) => {
      const value = element.getAttribute(`data-${lang}`);
      if (value !== null) {
        element.innerHTML = value;
      }
    });
  }

  function initClientBoard(onCellClick) {
    elements.caroBoard.innerHTML = '';
    elements.caroBoard.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
    elements.caroBoard.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 1fr)`;
    state.board = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const rowState = [];
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        rowState.push(null);
        const cell = document.createElement('div');
        cell.className = 'caro-cell';
        cell.dataset.r = row;
        cell.dataset.c = col;
        cell.addEventListener('click', () => onCellClick(row, col));
        elements.caroBoard.appendChild(cell);
      }
      state.board.push(rowState);
    }
  }

  function updateCellUI(row, col, symbol, isWinCell = false) {
    state.board[row][col] = symbol;
    
    // Remove last-move class from previously played cell
    const previousMove = elements.caroBoard.querySelector('.last-move');
    if (previousMove) {
      previousMove.classList.remove('last-move');
    }

    const index = row * BOARD_SIZE + col;
    const cell = elements.caroBoard.children[index];
    cell.textContent = symbol;
    cell.classList.add(symbol === 'X' ? 'cell-x' : 'cell-o');
    cell.classList.add('last-move');
    if (isWinCell) {
      cell.classList.add('win-cell');
    }
  }

  function updateAiTurnUI(isPlayerTurn, playerSymbol, difficulty) {
    const difficultyLabel = {
      easy: { vi: 'Dễ', en: 'Easy' },
      medium: { vi: 'Trung bình', en: 'Medium' },
      hard: { vi: 'Khó', en: 'Hard' }
    }[difficulty] || { vi: '', en: '' };
    const lang = getLang();
    const diffText = difficultyLabel[lang];

    const viLabel = isPlayerTurn
      ? `Lượt của bạn (${playerSymbol})`
      : `Máy đang suy nghĩ... [${diffText}]`;
    const enLabel = isPlayerTurn
      ? `Your turn (${playerSymbol})`
      : `AI is thinking... [${diffText}]`;

    elements.turnIndicator.setAttribute('data-vi', viLabel);
    elements.turnIndicator.setAttribute('data-en', enLabel);
    elements.turnIndicator.textContent = lang === 'en' ? enLabel : viLabel;
    elements.turnIndicator.style.background = isPlayerTurn ? 'var(--primary-color)' : 'var(--text-color)';
    elements.turnIndicator.style.color = isPlayerTurn ? '#ffffff' : 'var(--bg-color)';
    elements.caroBoard.classList.toggle('not-my-turn', !isPlayerTurn);
  }

  function updateOnlineTurnUI(turnPlayerName) {
    const isMe = turnPlayerName === state.myPlayerName;
    const symbol = state.onlinePlayers.indexOf(turnPlayerName) === 0 ? 'X' : 'O';
    const viLabel = isMe
      ? `Lượt của bạn (${symbol})`
      : `Lượt của: ${turnPlayerName} (${symbol})`;
    const enLabel = isMe
      ? `Your turn (${symbol})`
      : `Turn: ${turnPlayerName} (${symbol})`;

    elements.turnIndicator.setAttribute('data-vi', viLabel);
    elements.turnIndicator.setAttribute('data-en', enLabel);
    elements.turnIndicator.textContent = getLang() === 'en' ? enLabel : viLabel;
    elements.turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
    elements.turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
    elements.caroBoard.classList.toggle('not-my-turn', !isMe);
  }

  function addLog(playerName, symbol, row, col) {
    const line = document.createElement('p');
    line.innerHTML = getLang() === 'en'
      ? `<span class="fw-bold">${playerName}</span> placed <span class="${symbol === 'X' ? 'text-primary' : 'text-danger'}">${symbol}</span> at [${row}, ${col}]`
      : `<span class="fw-bold">${playerName}</span> đánh <span class="${symbol === 'X' ? 'text-primary' : 'text-danger'}">${symbol}</span> tại [${row}, ${col}]`;
    elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
  }

  function prependSystemLog(message) {
    const line = document.createElement('p');
    line.style.color = '#ef4444';
    line.style.fontStyle = 'italic';
    line.textContent = message;
    if (elements.historyLog.firstChild) {
      elements.historyLog.insertBefore(line, elements.historyLog.firstChild);
    }
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
    elements.playerCountLabel.textContent = players.length;
    players.forEach((name, index) => {
      const symbol = index === 0 ? 'X' : 'O';
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-user"></i> ${name} <span class="badge ${symbol === 'X' ? 'bg-primary' : 'bg-secondary'}">${symbol}</span>`;
      if (index === 0) {
        item.innerHTML += '<span class="host-badge">HOST</span>';
      }
      elements.lobbyPlayerList.appendChild(item);
    });
  }

  function syncHostControls() {
    if (state.isHost) {
      elements.btnStartOnline.style.display = 'flex';
      elements.waitHostMessage.style.display = 'none';
      elements.btnStartOnline.disabled = state.onlinePlayers.length < 2;
      return;
    }

    elements.btnStartOnline.style.display = 'none';
    elements.waitHostMessage.style.display = 'block';
  }

  function showWinner({ winner, isDraw, reason, isAiMode = false, isPlayerWin = false }) {
    const lang = getLang();
    let winMessage = '';

    if (isAiMode) {
      if (isDraw) {
        winMessage = lang === 'en' ? '🤝 Draw!' : '🤝 Hòa!';
      } else if (isPlayerWin) {
        winMessage = lang === 'en' ? '🎉 You win! Well done!' : '🎉 Bạn thắng! Xuất sắc!';
      } else {
        winMessage = lang === 'en' ? '🤖 AI wins! Better luck next time.' : '🤖 Máy thắng! Cố lên nhé!';
      }
    } else if (reason === 'opponent-left') {
      winMessage = lang === 'en'
        ? `🏆 ${winner} wins! (Opponent left)`
        : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
    } else if (isDraw) {
      winMessage = lang === 'en' ? '🤝 Draw!' : '🤝 Hòa!';
    } else {
      winMessage = lang === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
    }

    elements.winnerMessage.setAttribute('data-vi', winMessage);
    elements.winnerMessage.setAttribute('data-en', winMessage);
    elements.winnerMessage.textContent = winMessage;

    const restartSpan = elements.btnRestart.querySelector('span');
    if (isAiMode || state.isHost) {
      restartSpan.setAttribute('data-vi', 'Chơi lại');
      restartSpan.setAttribute('data-en', 'Play Again');
      restartSpan.textContent = lang === 'en' ? 'Play Again' : 'Chơi lại';
    } else {
      restartSpan.setAttribute('data-vi', 'Quay về');
      restartSpan.setAttribute('data-en', 'Back to Menu');
      restartSpan.textContent = lang === 'en' ? 'Back to Menu' : 'Quay về';
    }

    showScreen(elements.gameOverScreen);
  }

  return {
    addLog,
    getLang,
    initClientBoard,
    prependSystemLog,
    resetLobbyUI,
    showScreen,
    showWinner,
    syncHostControls,
    triggerLangUpdate,
    updateAiTurnUI,
    updateCellUI,
    updateLobbyPlayerList,
    updateOnlineTurnUI
  };
}
