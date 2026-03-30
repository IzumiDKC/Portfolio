// tien-len.js
const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3001' 
    : 'https://portfolio-3v3i.onrender.com';

const socket = io(socketUrl);

// Thẻ (UI Elements)
const screens = {
    lobby: document.getElementById('lobbyScreen'),
    play: document.getElementById('playScreen'),
    gameOver: document.getElementById('gameOverScreen')
};

const lobbySteps = {
    name: document.getElementById('lobbyNameStep'),
    wait: document.getElementById('lobbyWaitStep')
};

// State
let myId = null;
let roomCode = null;
let players = [];
let myHand = [];
let selectedCards = [];
let currentTurnId = null;
let isHost = false;

// Helpers
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function addLog(msg, color = 'var(--text-color)') {
    const logDiv = document.getElementById('historyLog');
    const entry = document.createElement('div');
    entry.style.color = color;
    entry.style.marginBottom = '5px';
    entry.innerHTML = `<small>[${new Date().toLocaleTimeString()}]</small> ${msg}`;
    logDiv.prepend(entry);
}

// Convert card code to rank/suit
function parseCard(c) {
    const r = Math.floor(c / 10);
    const s = c % 10;
    
    let suitStr = '';
    if(s === 0) suitStr = '♠';
    else if(s === 1) suitStr = '♣';
    else if(s === 2) suitStr = '♦';
    else suitStr = '♥';

    let rankStr = r.toString();
    if(r === 11) rankStr = 'J';
    if(r === 12) rankStr = 'Q';
    if(r === 13) rankStr = 'K';
    if(r === 14) rankStr = 'A';
    if(r === 15) rankStr = '2';

    return { rank: rankStr, suit: suitStr, sValue: s };
}

function renderCardHTML(c) {
    const { rank, suit, sValue } = parseCard(c);
    let colorClass = (sValue === 0 || sValue === 1) ? 'black-card' : 'red-card';
    
    return `
        <div class="tl-card ${colorClass}" data-cardcode="${c}" data-suit="${sValue}">
            <div class="tl-card-top">${rank}${suit}</div>
            <div class="tl-card-center">${suit}</div>
            <div class="tl-card-bottom">${rank}${suit}</div>
        </div>
    `;
}

// Lobby Logic
document.getElementById('btnCreateRoom').addEventListener('click', () => {
    const name = document.getElementById('onlineName').value.trim() || 'Player';
    socket.emit('create-room', { playerName: name, gameType: 'tien-len' });
    isHost = true;
});

document.getElementById('btnShowJoin').addEventListener('click', () => {
    document.getElementById('joinRoomGroup').style.display = 'flex';
});

document.getElementById('btnJoinRoom').addEventListener('click', () => {
    const name = document.getElementById('onlineName').value.trim() || 'Player';
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (code) {
        roomCode = code;
        socket.emit('join-room', { roomCode: code, playerName: name });
        isHost = false;
    }
});

document.getElementById('btnCopyCode').addEventListener('click', () => {
    if (roomCode) {
        navigator.clipboard.writeText(roomCode).then(() => {
            const btn = document.getElementById('btnCopyCode');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
            }, 2000);
        });
    }
});

socket.on('room-created', ({ roomCode: c, players: pList }) => {
    roomCode = c;
    players = pList;
    document.getElementById('roomCodeText').innerText = c;
    lobbySteps.name.style.display = 'none';
    lobbySteps.wait.style.display = 'block';
    
    document.getElementById('btnStartOnline').style.display = 'inline-flex';
    document.getElementById('waitHostMessage').style.display = 'none';
    
    updateLobbyPlayers();
});

socket.on('player-joined', ({ players: pList }) => {
    players = pList;
    updateLobbyPlayers();

    if (!isHost) {
        lobbySteps.name.style.display = 'none';
        lobbySteps.wait.style.display = 'block';
        document.getElementById('roomCodeText').innerText = roomCode;

        document.getElementById('btnStartOnline').style.display = 'none';
        document.getElementById('waitHostMessage').style.display = 'block';
    } else {
        document.getElementById('btnStartOnline').style.display = 'inline-flex';
        document.getElementById('waitHostMessage').style.display = 'none';
        document.getElementById('btnStartOnline').disabled = (players.length < 2);
    }
});

socket.on('join-error', ({ message }) => {
    document.getElementById('lobbyStatus').innerText = message;
    document.getElementById('lobbyStatus').style.color = '#ef4444';
});

function updateLobbyPlayers() {
    const list = document.getElementById('lobbyPlayerList');
    list.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p;
        if(p === players[0]) li.innerHTML += ' <span class="host-badge">HOST</span>';
        list.appendChild(li);
    });
    document.getElementById('playerCountLabel').innerText = players.length;

    if (isHost) {
        document.getElementById('btnStartOnline').disabled = (players.length < 2);
    }
}

document.getElementById('btnStartOnline').addEventListener('click', () => {
    if (isHost) {
        socket.emit('start-game');
    }
});

// Game Logic
socket.on('game-started', (data) => {
    showScreen('play');
    document.getElementById('historyLog').innerHTML = '';
    addLog('Trò chơi bắt đầu! Đang chia bài...', '#22c55e');
});

socket.on('tien-len-state', (data) => {
    // data = { players, turnId, lastMove, myHand }
    myHand = data.myHand;
    currentTurnId = data.turnId;

    // Draw my hand
    myId = myId || socket.id; // Nếu socket.id chưa cập nhật
    
    // Tìm ID bản thân trong mảng
    const me = data.players.find(p => p.name === document.getElementById('onlineName').value.trim() || p.id === socket.id);
    if(me) myId = me.id;

    renderHand();
    renderOpponents(data.players);
    
    // Draw table
    const tableDiv = document.getElementById('playedCardsContainer');
    if (data.lastMove && data.lastMove.cards) {
        tableDiv.innerHTML = data.lastMove.cards.map(c => renderCardHTML(c)).join('');
    } else {
        tableDiv.innerHTML = '';
        if(document.getElementById('tableMessage')) {
            document.getElementById('tableMessage').remove();
        }
    }

    // Update Turn Indicator
    const activeP = data.players.find(p => p.id === currentTurnId);
    if (activeP) {
        document.getElementById('turnIndicator').innerText = `Lượt của: ${activeP.name}`;
    }

    // Action buttons state
    const isMyTurn = (currentTurnId === myId);
    document.getElementById('btnPlaySelected').disabled = !isMyTurn;
    document.getElementById('btnPass').disabled = !isMyTurn || !data.lastMove;
});

function renderHand() {
    const handDiv = document.getElementById('myHandArea');
    handDiv.innerHTML = '';
    selectedCards = [];

    myHand.forEach(c => {
        const d = document.createElement('div');
        d.innerHTML = renderCardHTML(c);
        const cardEl = d.firstElementChild;
        
        cardEl.addEventListener('click', () => {
            if (cardEl.classList.contains('selected')) {
                cardEl.classList.remove('selected');
                selectedCards = selectedCards.filter(sc => sc !== c);
            } else {
                cardEl.classList.add('selected');
                selectedCards.push(c);
            }
        });
        handDiv.appendChild(cardEl);
    });
}

function renderOpponents(allPlayers) {
    const oppDiv = document.getElementById('opponentsArea');
    oppDiv.innerHTML = '';
    
    allPlayers.forEach(p => {
        if (p.id === myId) return; // Skip bản thân
        
        const div = document.createElement('div');
        div.className = `opponent-box ${p.id === currentTurnId ? 'active-turn' : ''} ${p.hasPassed ? 'passed' : ''}`;
        
        div.innerHTML = `
            <div class="opponent-name">${p.name} ${p.hasPassed ? '(Pass)' : ''}</div>
            <div class="opponent-cards"><i class="fa-solid fa-layer-group"></i> ${p.cardCount} lá</div>
        `;
        oppDiv.appendChild(div);
    });
}

// Action Buttons
document.getElementById('btnPlaySelected').addEventListener('click', () => {
    if (selectedCards.length === 0) return;
    socket.emit('tien-len-move', { cards: selectedCards });
});

document.getElementById('btnPass').addEventListener('click', () => {
    socket.emit('tien-len-pass');
});


socket.on('tien-len-played', ({ playerName, cards }) => {
    addLog(`<b>${playerName}</b> vừa đánh ${cards.length} lá bài.`);
});

socket.on('tien-len-new-round', () => {
    addLog(`Mọi người bỏ lượt, bắt đầu vòng mới!`, '#f59e0b');
    // Hiển thị chữ pass?
    const tableDiv = document.getElementById('tableArea');
    const msg = document.createElement('div');
    msg.id = 'tableMessage';
    msg.className = 'table-message';
    msg.innerText = 'VÒNG MỚI';
    tableDiv.appendChild(msg);
});

socket.on('play-error', ({ message }) => {
    addLog(`Lỗi: ${message}`, '#ef4444');
    alert(message);
});

socket.on('tien-len-winner', ({ winner }) => {
    showScreen('gameOver');
    document.getElementById('winnerMessage').innerText = `Người thắng: ${winner} 🏆`;
});

document.getElementById('btnRestart').addEventListener('click', () => {
    socket.emit('play-again');
});

socket.on('back-to-lobby', ({ players: pList }) => {
    showScreen('lobby');
    lobbySteps.name.style.display = 'none';
    lobbySteps.wait.style.display = 'block';
    players = pList;
    updateLobbyPlayers();
});

socket.on('player-left', ({ playerName, currentTurn, currentTurnIndex, newHost }) => {
    addLog(`<b>${playerName}</b> đã rời phòng.`, '#6b7280');
});

socket.on('game-ended-disconnect', ({ message }) => {
    showScreen('lobby');
    lobbySteps.name.style.display = 'block';
    lobbySteps.wait.style.display = 'none';
    alert(message);
});
