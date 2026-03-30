document.addEventListener('DOMContentLoaded', () => {
    // ── UI Elements ─────────────────────────────
    const lobbyScreen = document.getElementById('lobbyScreen');
    const playScreen = document.getElementById('playScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    
    // Online Lobby Elements
    const lobbyNameStep = document.getElementById('lobbyNameStep');
    const lobbyWaitStep = document.getElementById('lobbyWaitStep');
    const onlineNameInput = document.getElementById('onlineName');
    const btnCreateRoom = document.getElementById('btnCreateRoom');
    const btnShowJoin = document.getElementById('btnShowJoin');
    const joinRoomGroup = document.getElementById('joinRoomGroup');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const btnJoinRoom = document.getElementById('btnJoinRoom');
    const roomCodeText = document.getElementById('roomCodeText');
    const btnCopyCode = document.getElementById('btnCopyCode');
    const lobbyPlayerList = document.getElementById('lobbyPlayerList');
    const btnStartOnline = document.getElementById('btnStartOnline');
    const lobbyStatus = document.getElementById('lobbyStatus');
    const lobbyWaitStatus = document.getElementById('lobbyWaitStatus');
    const btnLeaveLobby = document.getElementById('btnLeaveLobby');
    const connectingOverlay = document.getElementById('connectingOverlay');
    const playerCountLabel = document.getElementById('playerCountLabel');
    
    // Game Play Elements
    const roomBadge = document.getElementById('roomBadge');
    const turnIndicator = document.getElementById('turnIndicator');
    const memoryBoard = document.getElementById('memoryBoard');
    const historyLog = document.getElementById('historyLog');
    const scoreLabelP1 = document.getElementById('scoreLabelP1');
    const scoreLabelP2 = document.getElementById('scoreLabelP2');
    
    // Game Over Elements
    const winnerMessage = document.getElementById('winnerMessage');
    const btnRestart = document.getElementById('btnRestart');

    // ── Game variables ──────────────────────────
    const BOARD_SIZE = 16;
    let isGameOver = false;

    // ── Online state ────────────────────────────
    let socket = null;
    let currentRoomCode = null;
    let myPlayerName = '';
    let isHost = false;
    let onlinePlayers = [];
    let currentTurnName = '';

    // ═══════════════════════════════════════════
    //  SERVER URL (Auto-detect environment)
    // ═══════════════════════════════════════════
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const SOCKET_URL = isLocalhost 
        ? 'http://localhost:3001' 
        : 'https://portfolio-3v3i.onrender.com';

    const langToggleBtn = document.getElementById('langToggle');

    // ── Helper: get lang ────────────────────────
    function getLang() {
        return document.documentElement.getAttribute('data-lang') || 'vi';
    }

    // ── Screen switching ────────────────────────
    function showScreen(screen) {
        [lobbyScreen, playScreen, gameOverScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    // ── Init Board ──────────────────────────────
    function initClientBoard() {
        memoryBoard.innerHTML = '';
        memoryBoard.classList.remove('not-my-turn');

        for (let i = 0; i < BOARD_SIZE; i++) {
            const card = document.createElement('div');
            card.className = 'memory-card';
            card.dataset.index = i;
            card.innerHTML = `
                <div class="memory-card-inner">
                    <div class="memory-card-front"></div>
                    <div class="memory-card-back"></div>
                </div>
            `;
            card.addEventListener('click', () => handleCardClick(i));
            memoryBoard.appendChild(card);
        }

        // Reset scores ui
        updateScoresUI({ player1: 0, player2: 0 });
    }

    // ── Handle Click ────────────────────────────
    function handleCardClick(index) {
        if (isGameOver || !socket || currentTurnName !== myPlayerName) return;
        const card = memoryBoard.children[index];
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
        
        // Optimistic UI, wait until server confirms to prevent cheating, but we let server handle it
        socket.emit('memory-flip', { cardIndex: index });
    }

    // ── Online Turn UI ──────────────────────────
    function updateOnlineTurnUI(turnPlayerName) {
        const isMe = turnPlayerName === myPlayerName;
        const l = getLang();
        
        const viStr = isMe ? `Lượt của bạn` : `Lượt của: ${turnPlayerName}`;
        const enStr = isMe ? `Your turn` : `Turn: ${turnPlayerName}`;
        
        turnIndicator.setAttribute('data-vi', viStr);
        turnIndicator.setAttribute('data-en', enStr);
        turnIndicator.textContent = l === 'en' ? enStr : viStr;
        
        turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
        turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
        
        if (isMe) {
            memoryBoard.classList.remove('not-my-turn');
        } else {
            memoryBoard.classList.add('not-my-turn');
        }
    }

    // ── Scores UI ───────────────────────────────
    function updateScoresUI(scores) {
        if(onlinePlayers.length < 2) return;
        scoreLabelP1.textContent = `${onlinePlayers[0]}: ${scores.player1}`;
        scoreLabelP2.textContent = `${onlinePlayers[1]}: ${scores.player2}`;
    }

    // ── Logs ────────────────────────────────────
    function addLog(playerName, action) {
        const p = document.createElement('p');
        p.innerHTML = `<span class="fw-bold">${playerName}</span> ${action}`;
        historyLog.insertBefore(p, historyLog.firstChild);
    }

    // ═══════════════════════════════════════════
    //  SOCKET LOGIC
    // ═══════════════════════════════════════════

    function resetLobbyUI() {
        lobbyNameStep.style.display = 'block';
        lobbyWaitStep.style.display = 'none';
        joinRoomGroup.classList.remove('active');
        lobbyStatus.textContent = '';
        lobbyStatus.className = 'status-message';
        onlineNameInput.value = localStorage.getItem('onlinePlayerName') || '';
    }

    resetLobbyUI();

    function connectSocket() {
        return new Promise((resolve, reject) => {
            if (socket && socket.connected) {
                resolve(socket);
                return;
            }

            connectingOverlay.classList.add('active');

            socket = io(SOCKET_URL, {
                transports: ['websocket', 'polling'],
                timeout: 15000,
                reconnection: true,
                reconnectionAttempts: 3
            });

            const timeout = setTimeout(() => {
                connectingOverlay.classList.remove('active');
                reject(new Error('Connection timeout'));
            }, 15000);

            socket.on('connect', () => {
                clearTimeout(timeout);
                connectingOverlay.classList.remove('active');
                setupSocketListeners();
                resolve(socket);
            });

            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                connectingOverlay.classList.remove('active');
                reject(err);
            });
        });
    }

    function disconnectSocket() {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        currentRoomCode = null;
        isHost = false;
        onlinePlayers = [];
    }

    function updateLobbyPlayerList(players) {
        lobbyPlayerList.innerHTML = '';
        playerCountLabel.textContent = players.length;
        players.forEach((name, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fa-solid fa-user"></i> <span style="font-weight:600; color:${i===0?'#3b82f6':'#ef4444'}">${name}</span>`;
            if (i === 0) li.innerHTML += `<span class="host-badge" style="margin-left:8px; font-size:0.7em; background:#3b82f6; padding:2px 6px; border-radius:4px; color:#fff;">HOST</span>`;
            lobbyPlayerList.appendChild(li);
        });
        
        if (players.length >= 2) {
            scoreLabelP1.textContent = `${players[0]}: 0`;
            scoreLabelP2.textContent = `${players[1]}: 0`;
        }
    }

    function setupSocketListeners() {
        if (!socket) return;
        socket.removeAllListeners();

        // ── Connect & Joins ───────────────────
        socket.on('room-created', ({ roomCode, players }) => {
            currentRoomCode = roomCode;
            isHost = true;
            onlinePlayers = players;
            
            lobbyNameStep.style.display = 'none';
            lobbyWaitStep.style.display = 'block';
            roomCodeText.textContent = roomCode;
            updateLobbyPlayerList(players);
            
            btnStartOnline.style.display = 'flex';
            document.getElementById('waitHostMessage').style.display = 'none';
            btnStartOnline.disabled = players.length < 2;
        });

        socket.on('join-error', ({ message }) => {
            lobbyStatus.textContent = message;
            lobbyStatus.className = 'status-message error';
        });

        socket.on('player-joined', ({ players }) => {
            onlinePlayers = players;
            updateLobbyPlayerList(players);
            
            if (!isHost) {
                lobbyNameStep.style.display = 'none';
                lobbyWaitStep.style.display = 'block';
                roomCodeText.textContent = currentRoomCode;
                
                btnStartOnline.style.display = 'none';
                document.getElementById('waitHostMessage').style.display = 'block';
            } else {
                btnStartOnline.style.display = 'flex';
                document.getElementById('waitHostMessage').style.display = 'none';
                btnStartOnline.disabled = players.length < 2;
            }
        });

        // ── Game Start ────────────────────────
        socket.on('game-started', ({ gameType, currentTurn, currentTurnIndex, boardSize }) => {
            if (gameType !== 'memory') return;
            currentTurnName = currentTurn;
            isGameOver = false;
            
            historyLog.innerHTML = '';
            initClientBoard();
            updateOnlineTurnUI(currentTurn);
            
            roomBadge.textContent = `🎮 ${currentRoomCode}`;
            roomBadge.style.display = 'inline-block';
            
            showScreen(playScreen);
        });

        // ── Memory Game Events ────────────────
        socket.on('turn-updated', ({ currentTurn }) => {
            currentTurnName = currentTurn;
            updateOnlineTurnUI(currentTurn);
        });

        socket.on('memory-card-flipped', ({ cardIndex, emoji, playerName }) => {
            const card = memoryBoard.children[cardIndex];
            const back = card.querySelector('.memory-card-back');
            back.textContent = emoji;
            card.classList.add('flipped');
        });

        socket.on('memory-match', ({ firstIndex, secondIndex, scorer, scores }) => {
            const card1 = memoryBoard.children[firstIndex];
            const card2 = memoryBoard.children[secondIndex];
            card1.classList.add('matched');
            card2.classList.add('matched');
            
            updateScoresUI(scores);
            const l = getLang();
            addLog(scorer, l === 'en' ? 'found a match!' : 'đã tìm thấy 1 cặp!');
        });

        socket.on('memory-unflip', ({ firstIndex, secondIndex }) => {
            const card1 = memoryBoard.children[firstIndex];
            const card2 = memoryBoard.children[secondIndex];
            card1.classList.remove('flipped');
            card2.classList.remove('flipped');
        });

        // ── Game Over ─────────────────────────
        socket.on('game-ended', ({ winner, status }) => {
            isGameOver = true;

            setTimeout(() => {
                const l = getLang();
                let winMsg = "";
                
                if (status === 'opponent-left') {
                    winMsg = l === 'en' ? `🏆 ${winner} wins! (Opponent left)` : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
                } else if (winner === 'Hòa / Draw') {
                    winMsg = l === 'en' ? `🤝 Draw!` : `🤝 Hòa!`;
                } else {
                    winMsg = l === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
                }
                
                winnerMessage.setAttribute('data-vi', winner === 'Hòa / Draw' ? '🤝 Hòa!' : (status === 'opponent-left' ? winMsg : `🎉 ${winner} chiến thắng!`));
                winnerMessage.setAttribute('data-en', winner === 'Hòa / Draw' ? '🤝 Draw!' : (status === 'opponent-left' ? winMsg : `🎉 ${winner} wins!`));
                winnerMessage.textContent = winMsg;
                
                showScreen(gameOverScreen);
                
                const restartSpan = btnRestart.querySelector('span');
                if (isHost) {
                    restartSpan.setAttribute('data-vi', 'Chơi lại');
                    restartSpan.setAttribute('data-en', 'Play Again');
                    restartSpan.textContent = l === 'en' ? 'Play Again' : 'Chơi lại';
                } else {
                    restartSpan.setAttribute('data-vi', 'Quay về');
                    restartSpan.setAttribute('data-en', 'Back to Menu');
                    restartSpan.textContent = l === 'en' ? 'Back to Menu' : 'Quay về';
                }
            }, 800);
        });

        // ── Player Left ───────────────────────
        socket.on('player-left', ({ playerName: leftPlayer, players, newHost }) => {
            onlinePlayers = players;
            isHost = (newHost === myPlayerName);
            
            if (lobbyScreen.classList.contains('active')) {
                updateLobbyPlayerList(players);
                
                if (isHost) {
                    btnStartOnline.style.display = 'flex';
                    document.getElementById('waitHostMessage').style.display = 'none';
                    btnStartOnline.disabled = players.length < 2;
                } else {
                    btnStartOnline.style.display = 'none';
                    document.getElementById('waitHostMessage').style.display = 'block';
                }
            }
            
            const l = getLang();
            const p = document.createElement('p');
            p.style.color = '#ef4444';
            p.style.fontStyle = 'italic';
            p.textContent = l === 'en' ? `⚠️ ${leftPlayer} left the room` : `⚠️ ${leftPlayer} đã rời phòng`;
            if (historyLog.firstChild) historyLog.insertBefore(p, historyLog.firstChild);
        });

        // ── Back to Lobby ─────────────────────
        socket.on('back-to-lobby', ({ players }) => {
            onlinePlayers = players;
            showScreen(lobbyScreen);
            lobbyNameStep.style.display = 'none';
            lobbyWaitStep.style.display = 'block';
            updateLobbyPlayerList(players);
            
            if (isHost) {
                btnStartOnline.style.display = 'flex';
                document.getElementById('waitHostMessage').style.display = 'none';
                btnStartOnline.disabled = players.length < 2;
            } else {
                btnStartOnline.style.display = 'none';
                document.getElementById('waitHostMessage').style.display = 'block';
            }
        });

        socket.on('disconnect', () => {
            if (!isGameOver && playScreen.classList.contains('active')) {
                const l = getLang();
                alert(l === 'en' ? 'Connection lost!' : 'Mất kết nối!');
                showScreen(lobbyScreen);
                resetLobbyUI();
            }
        });
    }

    // ── Lobby Events ────────────────────────────
    btnCreateRoom.addEventListener('click', async () => {
        const name = onlineNameInput.value.trim();
        if (!name) {
            lobbyStatus.textContent = getLang() === 'en' ? 'Please enter your name' : 'Vui lòng nhập tên';
            lobbyStatus.className = 'status-message error';
            return;
        }
        myPlayerName = name;
        localStorage.setItem('onlinePlayerName', name);
        
        try {
            await connectSocket();
            socket.emit('create-room', { playerName: name, gameType: 'memory' });
        } catch (e) {
            lobbyStatus.textContent = getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
            lobbyStatus.className = 'status-message error';
        }
    });

    btnShowJoin.addEventListener('click', () => {
        joinRoomGroup.classList.toggle('active');
        roomCodeInput.focus();
    });

    btnJoinRoom.addEventListener('click', async () => {
        const name = onlineNameInput.value.trim();
        const code = roomCodeInput.value.trim().toUpperCase();
        
        if (!name || !code || code.length < 4) return;
        
        myPlayerName = name;
        currentRoomCode = code;
        localStorage.setItem('onlinePlayerName', name);
        
        try {
            await connectSocket();
            socket.emit('join-room', { roomCode: code, playerName: name });
        } catch (e) {
            lobbyStatus.textContent = getLang() === 'en' ? 'Connection failed' : 'Lỗi kết nối';
            lobbyStatus.className = 'status-message error';
        }
    });

    const btnBackToSetup = document.getElementById('btnBackToSetup');
    if(btnBackToSetup) {
        btnBackToSetup.addEventListener('click', () => {
            disconnectSocket();
            resetLobbyUI();
        });
    }

    btnStartOnline.addEventListener('click', () => {
        if (!isHost || !socket) return;
        socket.emit('start-game');
    });

    btnLeaveLobby.addEventListener('click', () => {
        disconnectSocket();
        resetLobbyUI();
    });

    btnCopyCode.addEventListener('click', () => {
        if (!currentRoomCode) return;
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            const originalHtml = btnCopyCode.innerHTML;
            btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => {
                btnCopyCode.innerHTML = originalHtml;
            }, 2000);
        });
    });

    btnRestart.addEventListener('click', () => {
        if (isHost && socket) {
            socket.emit('play-again');
        } else {
            disconnectSocket();
            resetLobbyUI();
            showScreen(lobbyScreen);
        }
    });
    
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            requestAnimationFrame(() => {
                const l = getLang();
                document.querySelectorAll('[data-vi]').forEach(el => {
                    const v = el.getAttribute('data-' + l);
                    if(v !== null) el.innerHTML = v;
                });
            });
        });
    }

});
