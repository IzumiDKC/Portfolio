import { renderCardHTML } from './helpers.js';

export function createTienLenUi({ state, elements, socket }) {
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

  return {
    addLog,
    renderHand,
    renderOpponents,
    renderTable,
    showNewRoundMessage,
    showScreen,
    syncTurnState,
    updateLobbyPlayers
  };
}
