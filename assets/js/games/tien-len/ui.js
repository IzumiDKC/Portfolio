import { renderCardHTML } from './helpers.js';

export function createTienLenUi({ state, elements, socket }) {
  let timerAnimationId = null;
  function showScreen(screenId) {
    Object.values(elements.screens).forEach((screen) => screen.classList.remove('active'));
    elements.screens[screenId].classList.add('active');
  }

  function addLog(message, color = 'var(--text-color)') {
    const entry = document.createElement('div');
    entry.style.color = color;
    entry.style.marginBottom = '5px';
    entry.innerHTML = `<small>[${new Date().toLocaleTimeString()}]</small> ${message}`;
    elements.historyLog.prepend(entry);
  }

  function updateLobbyPlayers() {
    elements.lobbyPlayerList.innerHTML = '';
    state.players.forEach((playerName) => {
      const item = document.createElement('li');
      item.innerText = playerName;
      if (playerName === state.players[0]) {
        item.innerHTML += ' <span class="host-badge">HOST</span>';
      }
      elements.lobbyPlayerList.appendChild(item);
    });

    elements.playerCountLabel.innerText = state.players.length;
    if (state.isHost) {
      elements.btnStartOnline.disabled = state.players.length < 2;
    }
  }

  function renderHand() {
    elements.myHandArea.innerHTML = '';
    state.selectedCards = [];

    state.myHand.forEach((cardCode) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCardHTML(cardCode);
      const cardElement = wrapper.firstElementChild;
      cardElement.addEventListener('click', () => {
        if (cardElement.classList.contains('selected')) {
          cardElement.classList.remove('selected');
          state.selectedCards = state.selectedCards.filter((selected) => selected !== cardCode);
        } else {
          cardElement.classList.add('selected');
          state.selectedCards.push(cardCode);
        }
      });
      elements.myHandArea.appendChild(cardElement);
    });
  }

  function renderOpponents(allPlayers) {
    elements.opponentsArea.innerHTML = '';
    allPlayers.forEach((player) => {
      if (player.id === state.myId) {
        return;
      }

      const opponent = document.createElement('div');
      opponent.className = `opponent-box ${player.id === state.currentTurnId ? 'active-turn' : ''} ${player.hasPassed ? 'passed' : ''}`;
      opponent.innerHTML = `
        <div class="opponent-name">${player.name} ${player.hasPassed ? '(Pass)' : ''}</div>
        <div class="opponent-cards"><i class="fa-solid fa-layer-group"></i> ${player.cardCount} lá</div>
      `;
      elements.opponentsArea.appendChild(opponent);
    });
  }

  function renderTable(lastMove) {
    if (lastMove && lastMove.cards) {
      elements.playedCardsContainer.innerHTML = lastMove.cards.map((cardCode) => renderCardHTML(cardCode)).join('');
      return;
    }

    elements.playedCardsContainer.innerHTML = '';
    const previousMessage = document.getElementById('tableMessage');
    if (previousMessage) {
      previousMessage.remove();
    }
  }

  function showNewRoundMessage() {
    const message = document.createElement('div');
    message.id = 'tableMessage';
    message.className = 'table-message';
    message.innerText = 'VÒNG MỚI';
    elements.tableArea.appendChild(message);
  }

  function syncTurnState(allPlayers, lastMove) {
    const activePlayer = allPlayers.find((player) => player.id === state.currentTurnId);
    if (activePlayer) {
      elements.turnIndicator.innerText = `Lượt của: ${activePlayer.name}`;
    }

    const isMyTurn = state.currentTurnId === state.myId;
    elements.btnPlaySelected.disabled = !isMyTurn;
    elements.btnPass.disabled = !isMyTurn || !lastMove;
  }

  function updateTimer(turnStartTime, turnLimit) {
    if (timerAnimationId) {
      cancelAnimationFrame(timerAnimationId);
    }

    if (!turnStartTime || !turnLimit) {
      elements.timerBar.style.width = '100%';
      elements.timerBar.style.background = '#22c55e';
      return;
    }

    function step() {
      const now = Date.now();
      const elapsed = now - turnStartTime;
      const remaining = Math.max(0, turnLimit - elapsed);
      const percentage = (remaining / turnLimit) * 100;

      elements.timerBar.style.width = percentage + '%';

      if (percentage < 20) {
        elements.timerBar.style.background = '#ef4444'; // Red
      } else if (percentage < 50) {
        elements.timerBar.style.background = '#f59e0b'; // Orange
      } else {
        elements.timerBar.style.background = '#22c55e'; // Green
      }

      if (remaining > 0) {
        timerAnimationId = requestAnimationFrame(step);
      }
    }

    timerAnimationId = requestAnimationFrame(step);
  }

    function renderEndGameHands(allHands) {
    elements.opponentsArea.innerHTML = '';
    allHands.forEach((player) => {
      if (player.id === state.myId) {
        return; // Me (already rendered in bottom hand area)
      }

      const opponent = document.createElement('div');
      opponent.className = 'opponent-box';
      
      let cardsHtml = '';
      if (player.hand.length === 0) {
        cardsHtml = `<span style="color:var(--primary-color); font-weight:bold;">${player.rankName}</span>`;
      } else {
        cardsHtml = `<div style="display:flex; gap:-20px; align-items:center; justify-content:center; transform: scale(0.6); transform-origin: top center;">
          ${player.hand.map((cardCode, idx) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderCardHTML(cardCode);
            const cardEl = wrapper.firstElementChild;
            cardEl.style.marginLeft = idx === 0 ? '0' : '-35px';
            return cardEl.outerHTML;
          }).join('')}
        </div>`;
      }

      opponent.innerHTML = `
        <div class="opponent-name">${player.name}</div>
        <div class="opponent-cards" style="margin-top: 5px;">
           ${cardsHtml}
        </div>
        ${player.hand.length > 0 ? `<div style="color:var(--primary-color); font-size: 0.8rem; margin-top: 5px; font-weight:bold;">${player.rankName}</div>` : ''}
      `;
      elements.opponentsArea.appendChild(opponent);
    });
  }

  function renderHistory(historyData) {
    if (!historyData || historyData.length === 0) {
      elements.lobbyHistory.style.display = 'none';
      return;
    }
    
    elements.lobbyHistory.style.display = 'block';
    elements.historyWinnerList.innerHTML = '';
    
    // Đảo ngược để hiện mới nhất lên đầu
    [...historyData].reverse().forEach((entry, index) => {
      const li = document.createElement('li');
      li.style.padding = '3px 0';
      li.style.borderBottom = '1px dashed rgba(255,255,255,0.1)';
      li.innerHTML = `<b>Ván ${historyData.length - index}:</b> ${entry.winner}`;
      elements.historyWinnerList.appendChild(li);
    });
  }

  return {
    addLog,
    renderHand,
    renderOpponents,
    renderTable,
    showNewRoundMessage,
    showScreen,
    syncTurnState,
    updateLobbyPlayers,
    updateTimer,
    renderEndGameHands,
    renderHistory
  };
}
