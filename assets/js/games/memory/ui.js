import { BOARD_SIZE } from './constants.js';

export function createMemoryUi({ state, elements }) {
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

  function initClientBoard(onCardClick) {
    elements.memoryBoard.innerHTML = '';
    elements.memoryBoard.classList.remove('not-my-turn');

    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.index = index;
      card.innerHTML = `
        <div class="memory-card-inner">
          <div class="memory-card-front"></div>
          <div class="memory-card-back"></div>
        </div>
      `;
      card.addEventListener('click', () => onCardClick(index));
      elements.memoryBoard.appendChild(card);
    }

    updateScoresUI({ player1: 0, player2: 0 });
  }

  function updateOnlineTurnUI(turnPlayerName) {
    const isMe = turnPlayerName === state.myPlayerName;
    const viLabel = isMe ? 'Lượt của bạn' : `Lượt của: ${turnPlayerName}`;
    const enLabel = isMe ? 'Your turn' : `Turn: ${turnPlayerName}`;

    elements.turnIndicator.setAttribute('data-vi', viLabel);
    elements.turnIndicator.setAttribute('data-en', enLabel);
    elements.turnIndicator.textContent = getLang() === 'en' ? enLabel : viLabel;
    elements.turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
    elements.turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
    elements.memoryBoard.classList.toggle('not-my-turn', !isMe);
  }

  function updateScoresUI(scores) {
    if (state.onlinePlayers.length < 2) {
      return;
    }

    elements.scoreLabelP1.textContent = `${state.onlinePlayers[0]}: ${scores.player1}`;
    elements.scoreLabelP2.textContent = `${state.onlinePlayers[1]}: ${scores.player2}`;
  }

  function addLog(playerName, action) {
    const line = document.createElement('p');
    line.innerHTML = `<span class="fw-bold">${playerName}</span> ${action}`;
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

  function flipCard(cardIndex, emoji) {
    const card = elements.memoryBoard.children[cardIndex];
    const back = card.querySelector('.memory-card-back');
    back.textContent = emoji;
    card.classList.add('flipped');
  }

  function markMatched(firstIndex, secondIndex) {
    elements.memoryBoard.children[firstIndex].classList.add('matched');
    elements.memoryBoard.children[secondIndex].classList.add('matched');
  }

  function unflipCards(firstIndex, secondIndex) {
    elements.memoryBoard.children[firstIndex].classList.remove('flipped');
    elements.memoryBoard.children[secondIndex].classList.remove('flipped');
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
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-user"></i> <span style="font-weight:600; color:${index === 0 ? '#3b82f6' : '#ef4444'}">${name}</span>`;
      if (index === 0) {
        item.innerHTML += '<span class="host-badge" style="margin-left:8px; font-size:0.7em; background:#3b82f6; padding:2px 6px; border-radius:4px; color:#fff;">HOST</span>';
      }
      elements.lobbyPlayerList.appendChild(item);
    });

    if (players.length >= 2) {
      elements.scoreLabelP1.textContent = `${players[0]}: 0`;
      elements.scoreLabelP2.textContent = `${players[1]}: 0`;
    }
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

  function showWinner({ winner, status }) {
    const lang = getLang();
    let winMessage = '';

    if (status === 'opponent-left') {
      winMessage = lang === 'en'
        ? `🏆 ${winner} wins! (Opponent left)`
        : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
    } else if (winner === 'Hòa / Draw') {
      winMessage = lang === 'en' ? '🤝 Draw!' : '🤝 Hòa!';
    } else {
      winMessage = lang === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
    }

    elements.winnerMessage.setAttribute(
      'data-vi',
      winner === 'Hòa / Draw' ? '🤝 Hòa!' : (status === 'opponent-left' ? winMessage : `🎉 ${winner} chiến thắng!`)
    );
    elements.winnerMessage.setAttribute(
      'data-en',
      winner === 'Hòa / Draw' ? '🤝 Draw!' : (status === 'opponent-left' ? winMessage : `🎉 ${winner} wins!`)
    );
    elements.winnerMessage.textContent = winMessage;

    const restartSpan = elements.btnRestart.querySelector('span');
    if (state.isHost) {
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
    flipCard,
    getLang,
    initClientBoard,
    markMatched,
    prependSystemLog,
    resetLobbyUI,
    showScreen,
    showWinner,
    syncHostControls,
    triggerLangUpdate,
    unflipCards,
    updateLobbyPlayerList,
    updateOnlineTurnUI,
    updateScoresUI
  };
}
