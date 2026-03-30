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
    const caroBoard = document.getElementById('caroBoard');
    const historyLog = document.getElementById('historyLog');
    
    // Game Over Elements
    const winnerMessage = document.getElementById('winnerMessage');
    const btnRestart = document.getElementById('btnRestart');

    // ── Game variables ──────────────────────────
    const BOARD_SIZE = 20;
    let board = [];
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
        caroBoard.innerHTML = '';
        caroBoard.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
        caroBoard.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 1fr)`;
        board = [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            let rowObj = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                rowObj.push(null);
                const cell = document.createElement('div');
                cell.className = 'caro-cell';
                cell.dataset.r = r;
                cell.dataset.c = c;
                cell.addEventListener('click', () => handleCellClick(r, c));
                caroBoard.appendChild(cell);
            }
            board.push(rowObj);
        }
    }

    // ── Handle Click ────────────────────────────
    function handleCellClick(r, c) {
        if (isGameOver || !socket || currentTurnName !== myPlayerName) return;
        if (board[r][c] !== null) return;
        
        socket.emit('caro-move', { row: r, col: c });
    }

    // ── Update Grid UI ──────────────────────────
    function updateCellUI(r, c, symbol, isWinCell = false) {
        board[r][c] = symbol;
        const index = r * BOARD_SIZE + c;
        const cell = caroBoard.children[index];
        cell.textContent = symbol;
        cell.classList.add(symbol === 'X' ? 'cell-x' : 'cell-o');
        if (isWinCell) cell.classList.add('win-cell');
    }

    // ── Online Turn UI ──────────────────────────
    function updateOnlineTurnUI(turnPlayerName) {
        const isMe = turnPlayerName === myPlayerName;
        const l = getLang();
        
        const symbol = (onlinePlayers.indexOf(turnPlayerName) === 0) ? 'X' : 'O';
        const viStr = isMe ? `Lượt của bạn (${symbol})` : `Lượt của: ${turnPlayerName} (${symbol})`;
        const enStr = isMe ? `Your turn (${symbol})` : `Turn: ${turnPlayerName} (${symbol})`;
        
        turnIndicator.setAttribute('data-vi', viStr);
        turnIndicator.setAttribute('data-en', enStr);
        turnIndicator.textContent = l === 'en' ? enStr : viStr;
        
        turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
        turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
        
        if (isMe) {
            caroBoard.classList.remove('not-my-turn');
        } else {
            caroBoard.classList.add('not-my-turn');
        }
    }

    // ── Logs ────────────────────────────────────
    function addLog(playerName, symbol, row, col) {
        const l = getLang();
        const p = document.createElement('p');
        p.innerHTML = l === 'en'
            ? `<span class="fw-bold">${playerName}</span> placed <span class="${symbol === 'X' ? 'text-primary' : 'text-danger'}">${symbol}</span> at [${row}, ${col}]`
            : `<span class="fw-bold">${playerName}</span> đánh <span class="${symbol === 'X' ? 'text-primary' : 'text-danger'}">${symbol}</span> tại [${row}, ${col}]`;
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
            const symbol = i === 0 ? 'X' : 'O';
            li.innerHTML = `<i class="fa-solid fa-user"></i> ${name} <span class="badge ${symbol==='X'?'bg-primary':'bg-secondary'}">${symbol}</span>`;
            if (i === 0) li.innerHTML += `<span class="host-badge">HOST</span>`;
            lobbyPlayerList.appendChild(li);
        });
    }

    function setupSocketListeners() {
        if (!socket) return;
        socket.removeAllListeners();

        // ── Room Created ──────────────────────
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

        // ── Join Error ────────────────────────
        socket.on('join-error', ({ message }) => {
            lobbyStatus.textContent = message;
            lobbyStatus.className = 'status-message error';
        });

        // ── Player Joined ─────────────────────
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

        // ── Caro Start ────────────────────────
        socket.on('caro-start', ({ currentTurn, players }) => {
            onlinePlayers = players;
            currentTurnName = currentTurn;
            isGameOver = false;
            
            historyLog.innerHTML = '';
            initClientBoard();
            updateOnlineTurnUI(currentTurn);
            
            roomBadge.textContent = `🎮 ${currentRoomCode}`;
            roomBadge.style.display = 'inline-block';
            
            showScreen(playScreen);
        });

        // ── Caro Result (Move) ────────────────
        socket.on('caro-result', ({ playerName, row, col, symbol, currentTurn }) => {
            updateCellUI(row, col, symbol);
            addLog(playerName, symbol, row, col);
            
            currentTurnName = currentTurn;
            updateOnlineTurnUI(currentTurn);
        });

        // ── Caro Over (Win/Draw) ──────────────
        socket.on('caro-over', ({ winner, row, col, symbol, isDraw, reason }) => {
            isGameOver = true;
            
            if (row !== undefined && col !== undefined) {
                updateCellUI(row, col, symbol, !isDraw); // highlight win move
                addLog(winner !== 'Hòa / Draw' ? winner : '---', symbol, row, col);
            }

            setTimeout(() => {
                const l = getLang();
                let winMsg = "";
                
                if (reason === 'opponent-left') {
                    winMsg = l === 'en' ? `🏆 ${winner} wins! (Opponent left)` : `🏆 ${winner} thắng! (Đối thủ rời đi)`;
                } else if (isDraw) {
                    winMsg = l === 'en' ? `🤝 Draw!` : `🤝 Hòa!`;
                } else {
                    winMsg = l === 'en' ? `🎉 ${winner} wins!` : `🎉 ${winner} chiến thắng!`;
                }
                
                winnerMessage.setAttribute('data-vi', isDraw ? '🤝 Hòa!' : (reason ? winMsg : `🎉 ${winner} chiến thắng!`));
                winnerMessage.setAttribute('data-en', isDraw ? '🤝 Draw!' : (reason ? winMsg : `🎉 ${winner} wins!`));
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

        // ── Disconnect ────────────────────────
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
            socket.emit('create-room', { playerName: name, gameType: 'caro' });
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

    btnBackToSetup = document.getElementById('btnBackToSetup');
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

    // Copy room code
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
