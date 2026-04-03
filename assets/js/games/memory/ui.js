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

  function initClientBoard(onCardClick, boardSize = 42, columns = 7, rows = 6) {
    elements.memoryBoard.innerHTML = '';
    elements.memoryBoard.classList.remove('not-my-turn');
    elements.memoryBoard.style.transform = 'rotate(0deg)';
    
    elements.memoryBoard.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    elements.memoryBoard.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    elements.memoryBoard.style.aspectRatio = `${columns} / ${rows}`;
    
    const fontSize = columns >= 8 ? '1.2rem' : (columns >= 7 ? '1.5rem' : '2.0rem');

    for (let index = 0; index < boardSize; index += 1) {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.index = index;
      card.innerHTML = `
        <div class="memory-card-inner">
          <div class="memory-card-front" style="font-size: ${fontSize};"></div>
          <div class="memory-card-back" style="font-size: ${fontSize};"></div>
        </div>
      `;
      card.addEventListener('click', () => onCardClick(index));
      elements.memoryBoard.appendChild(card);
    }

    // updateScoresUI is now called by the server event directly
  }

  let timerReq = null;
  function startTimerBar(duration) {
    if (timerReq) cancelAnimationFrame(timerReq);
    elements.turnTimerBar.style.transition = 'none';
    elements.turnTimerBar.style.transform = 'scaleX(1)';
    elements.turnTimerBar.classList.remove('warning');
    
    // Slight delay to allow CSS reset
    requestAnimationFrame(() => {
      elements.turnTimerBar.style.transition = `transform ${duration}ms linear, background-color 0.3s`;
      elements.turnTimerBar.style.transform = 'scaleX(0)';
    });
    
    const startObj = Date.now();
    function checkWarning() {
      const elapsed = Date.now() - startObj;
      if (elapsed > duration * 0.7) {
        elements.turnTimerBar.classList.add('warning');
      } else {
        timerReq = requestAnimationFrame(checkWarning);
      }
    }
    timerReq = requestAnimationFrame(checkWarning);
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
    
    if (elements.btnUseHint) {
      const hasHint = state.hints && state.hints[state.myPlayerName] > 0;
      elements.btnUseHint.disabled = !isMe || !hasHint;
    }
  }

  function updateScoresUI(scores, hints) {
    if (hints) state.hints = hints;
    if (state.onlinePlayers.length < 2) return;
    
    elements.memoryScoresWrapper.innerHTML = '';
    
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
    
    state.onlinePlayers.forEach((playerName, index) => {
      const score = scores && scores[playerName] !== undefined ? scores[playerName] : 0;
      const hintCount = hints && hints[playerName] !== undefined ? hints[playerName] : 0;
      
      const el = document.createElement('div');
      el.style.color = colors[index % colors.length];
      el.style.flex = '1';
      el.style.textAlign = 'center';
      
      el.innerHTML = `<span>${playerName} ${hintCount > 0 ? '💡' : ''}: ${score}</span>`;
      elements.memoryScoresWrapper.appendChild(el);
    });

    if (elements.btnUseHint) {
      const hasHint = state.hints && state.hints[state.myPlayerName] > 0;
      const isMe = state.currentTurnName === state.myPlayerName;
      elements.btnUseHint.disabled = !isMe || !hasHint;
    }
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

  function playFreezeEffect(playerName) {
    const overlay = document.createElement('div');
    overlay.className = 'freeze-overlay active';
    overlay.innerHTML = `<div style="font-size: 5rem; animation: pulse 1s infinite;">🧊</div><h2 style="color: #fff; margin-top:10px;">${playerName} bị đóng băng!</h2>`;
    document.body.appendChild(overlay);
    
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(59, 130, 246, 0.4)', backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: '9999', pointerEvents: 'none', transition: 'opacity 0.5s'
    });

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    }, 1500);
    
    addLog(playerName, getLang() === 'en' ? 'flipped a Freeze card! Lost turn & next turn skipped.' : 'lật trúng Thẻ Băng! Bị đóng băng & mất lượt tiếp theo.');
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
    updateScoresUI,
    startTimerBar,
    playFreezeEffect
  };
}
