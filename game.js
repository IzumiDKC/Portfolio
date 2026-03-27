document.addEventListener('DOMContentLoaded', () => {
    // ── UI Elements ─────────────────────────────
    const setupScreen = document.getElementById('setupScreen');
    const playScreen = document.getElementById('playScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameModeSelect = document.getElementById('gameMode');
    const playerCountGroup = document.getElementById('playerCountGroup');
    const playerCountInput = document.getElementById('playerCount');
    const btnStart = document.getElementById('btnStart');
    
    const turnIndicator = document.getElementById('turnIndicator');
    const rangeDisplay = document.getElementById('rangeDisplay');
    const minValSpan = document.getElementById('minVal');
    const maxValSpan = document.getElementById('maxVal');
    
    const guessInput = document.getElementById('guessInput');
    const btnGuess = document.getElementById('btnGuess');
    const historyLog = document.getElementById('historyLog');
    
    const winnerMessage = document.getElementById('winnerMessage');
    const secretNumberDisplay = document.getElementById('secretNumberDisplay');
    const btnRestart = document.getElementById('btnRestart');

    // Online Lobby Elements
    const lobbyNameStep = document.getElementById('lobbyNameStep');
    const lobbyWaitStep = document.getElementById('lobbyWaitStep');
    const onlineNameInput = document.getElementById('onlineName');
    const btnCreateRoom = document.getElementById('btnCreateRoom');
    const btnShowJoin = document.getElementById('btnShowJoin');
    const joinRoomGroup = document.getElementById('joinRoomGroup');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const btnJoinRoom = document.getElementById('btnJoinRoom');
    const btnBackToSetup = document.getElementById('btnBackToSetup');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const roomCodeText = document.getElementById('roomCodeText');
    const lobbyPlayerList = document.getElementById('lobbyPlayerList');
    const btnStartOnline = document.getElementById('btnStartOnline');
    const lobbyStatus = document.getElementById('lobbyStatus');
    const lobbyWaitStatus = document.getElementById('lobbyWaitStatus');
    const btnLeaveLobby = document.getElementById('btnLeaveLobby');
    const connectingOverlay = document.getElementById('connectingOverlay');
    const roomBadge = document.getElementById('roomBadge');

    // ── Game variables ──────────────────────────
    let minRange = 0;
    let maxRange = 1000;
    let secretAmount = 0;
    let mode = 'bot'; // 'bot', 'multi', or 'online'
    let totalPlayers = 2;
    let currentPlayer = 1;
    let isGameOver = false;

    // ── Online state ────────────────────────────
    let socket = null;
    let currentRoomCode = null;
    let myPlayerName = '';
    let isHost = false;
    let onlinePlayers = [];
    let myTurnIndex = -1;
    let currentTurnName = '';

    // ═══════════════════════════════════════════
    //  SERVER URL — thay đổi khi deploy lên Render
    // ═══════════════════════════════════════════
    const SOCKET_URL = 'http://localhost:3001';
    // Sau khi deploy Render, đổi thành:
    // const SOCKET_URL = 'https://your-app-name.onrender.com';

    const langToggleBtn = document.getElementById('langToggle');

    // ── Helper: get lang ────────────────────────
    function getLang() {
        return document.documentElement.getAttribute('data-lang') || 'vi';
    }

    // ── Screen switching ────────────────────────
    function showScreen(screen) {
        [setupScreen, playScreen, gameOverScreen, lobbyScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    // ═══════════════════════════════════════════
    //  OFFLINE LOGIC (unchanged from original)
    // ═══════════════════════════════════════════

    gameModeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'multi') {
            playerCountGroup.style.display = 'block';
        } else {
            playerCountGroup.style.display = 'none';
        }
    });

    btnStart.addEventListener('click', () => {
        mode = gameModeSelect.value;
        if (mode === 'online') {
            showScreen(lobbyScreen);
            resetLobbyUI();
            return;
        }
        if (mode === 'multi') {
            totalPlayers = parseInt(playerCountInput.value) || 2;
            if (totalPlayers < 2) totalPlayers = 2;
            if (totalPlayers > 10) totalPlayers = 10;
        } else {
            totalPlayers = 2;
        }
        startOfflineGame();
    });

    btnGuess.addEventListener('click', () => {
        if (mode === 'online') {
            sendOnlineGuess();
        } else {
            processGuess(null);
        }
    });

    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (mode === 'online') {
                sendOnlineGuess();
            } else {
                processGuess(null);
            }
        }
    });

    btnRestart.addEventListener('click', () => {
        if (mode === 'online') {
            if (isHost && socket) {
                socket.emit('play-again');
            } else {
                // Non-host: disconnect and go back to setup
                disconnectSocket();
                showScreen(setupScreen);
            }
        } else {
            gameOverScreen.classList.remove('active');
            setupScreen.classList.add('active');
        }
    });

    function startOfflineGame() {
        minRange = 0;
        maxRange = 1000;
        secretAmount = Math.floor(Math.random() * 1001);
        currentPlayer = 1;
        isGameOver = false;
        
        historyLog.innerHTML = '';
        roomBadge.style.display = 'none';
        updateRangeUI();
        updateTurnUI();
        guessInput.value = '';
        guessInput.disabled = false;
        btnGuess.disabled = false;
        
        showScreen(playScreen);
        guessInput.focus();
        
        if(window._iyu && typeof window._iyu.getLang === 'function'){
            triggerLangUpdate(window._iyu.getLang());
        }
    }

    function processGuess(botGuessVal = null) {
        if (isGameOver) return;

        let guessStr = guessInput.value.trim();
        let guess = botGuessVal !== null ? botGuessVal : parseInt(guessStr);
        
        if (isNaN(guess) || guess < minRange || guess > maxRange) {
            const l = getLang();
            const msg = l === 'en' 
                ? `Please enter a number between ${minRange} and ${maxRange}!`
                : `Vui lòng nhập số từ ${minRange} đến ${maxRange}!`;
            alert(msg);
            return;
        }
        
        if (guess === secretAmount) {
            endGame(currentPlayer, guess);
            return;
        }

        const isUp = guess < secretAmount;
        if (isUp) {
            minRange = guess;
        } else {
            maxRange = guess;
        }
        
        addLog(currentPlayer, guess, isUp);
        updateRangeUI();
        guessInput.value = '';
        
        currentPlayer++;
        if (currentPlayer > totalPlayers) {
            currentPlayer = 1;
        }
        
        updateTurnUI();

        if (mode === 'bot' && currentPlayer === 2 && !isGameOver) {
            guessInput.disabled = true;
            btnGuess.disabled = true;
            setTimeout(botTurn, 800);
        } else {
            guessInput.disabled = false;
            btnGuess.disabled = false;
            guessInput.focus();
        }
    }

    function botTurn() {
        if (isGameOver) return;
        
        let minBound = minRange;
        let maxBound = maxRange;
        
        if (maxBound - minBound <= 2) {
            let botGuess = minBound + 1;
            processGuess(botGuess);
            return;
        }

        let botGuess = Math.floor(Math.random() * (maxBound - minBound - 1)) + minBound + 1;
        processGuess(botGuess);
    }

    function updateRangeUI() {
        minValSpan.textContent = minRange;
        maxValSpan.textContent = maxRange;
        
        rangeDisplay.classList.remove('pop');
        void rangeDisplay.offsetWidth;
        rangeDisplay.classList.add('pop');
        
        setTimeout(() => {
            rangeDisplay.classList.remove('pop');
        }, 300);
    }

    function updateTurnUI() {
        const viStr = mode === 'bot' && currentPlayer===2 ? 'Máy (Bot)' : (mode === 'bot' && currentPlayer===1 ? 'Bạn' : `Người chơi ${currentPlayer}`);
        const enStr = mode === 'bot' && currentPlayer===2 ? 'Bot' : (mode === 'bot' && currentPlayer===1 ? 'You' : `Player ${currentPlayer}`);
        
        turnIndicator.setAttribute('data-vi', `Lượt của: ${viStr}`);
        turnIndicator.setAttribute('data-en', `Turn: ${enStr}`);
        
        const l = getLang();
        turnIndicator.textContent = l === 'en' ? `Turn: ${enStr}` : `Lượt của: ${viStr}`;
    }

    function addLog(playerNum, guessVal, isUp, playerNameOverride = null) {
        let pStrVi, pStrEn;
        
        if (playerNameOverride) {
            pStrVi = playerNameOverride;
            pStrEn = playerNameOverride;
        } else {
            pStrVi = playerNum === 1 ? (mode === 'bot' ? 'Bạn' : 'Người chơi 1') : (mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${playerNum}`);
            pStrEn = playerNum === 1 ? (mode === 'bot' ? 'You' : 'Player 1') : (mode === 'bot' ? 'Bot' : `Player ${playerNum}`);
        }
        
        const gHtml = `<span style="color:var(--primary-color);font-weight:900;">${guessVal}</span>`;
        
        const upVi = 'Đã nâng giới hạn dưới.';
        const downVi = 'Đã giảm giới hạn trên.';
        const upEn = 'Increased lower bound.';
        const downEn = 'Decreased upper bound.';
        
        const viHtml = `${pStrVi} đoán ${gHtml}. ${isUp ? upVi : downVi}`;
        const enHtml = `${pStrEn} guessed ${gHtml}. ${isUp ? upEn : downEn}`;
        
        const p = document.createElement('p');
        p.setAttribute('data-vi', viHtml);
        p.setAttribute('data-en', enHtml);
        
        const l = getLang();
        p.innerHTML = l === 'en' ? enHtml : viHtml;
        
        historyLog.insertBefore(p, historyLog.firstChild);
    }

    function endGame(winningPlayerNum, correctNumber, winnerNameOverride = null) {
        isGameOver = true;
        showScreen(gameOverScreen);
        
        let pStrVi, pStrEn;
        if (winnerNameOverride) {
            pStrVi = winnerNameOverride;
            pStrEn = winnerNameOverride;
        } else {
            pStrVi = winningPlayerNum === 1 ? (mode === 'bot' ? 'Bạn' : 'Người chơi 1') : (mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${winningPlayerNum}`);
            pStrEn = winningPlayerNum === 1 ? (mode === 'bot' ? 'You' : 'Player 1') : (mode === 'bot' ? 'Bot' : `Player ${winningPlayerNum}`);
        }
        
        const winVi = `🎉 ${pStrVi} chiến thắng!`;
        const winEn = `🎉 ${pStrEn} wins!`;
        
        winnerMessage.setAttribute('data-vi', winVi);
        winnerMessage.setAttribute('data-en', winEn);
        
        const l = getLang();
        winnerMessage.textContent = l === 'en' ? winEn : winVi;
        
        secretNumberDisplay.textContent = correctNumber;
    }
    
    function triggerLangUpdate(l) {
        document.querySelectorAll('[data-vi]').forEach(el => {
            const v = el.getAttribute('data-' + l);
            if(v !== null) el.innerHTML = v;
        });
    }

    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            requestAnimationFrame(() => {
                const l = getLang();
                triggerLangUpdate(l);
            });
        });
    }

    // ═══════════════════════════════════════════
    //  ONLINE MULTIPLAYER LOGIC
    // ═══════════════════════════════════════════

    function resetLobbyUI() {
        lobbyNameStep.style.display = 'block';
        lobbyWaitStep.style.display = 'none';
        joinRoomGroup.classList.remove('active');
        lobbyStatus.textContent = '';
        lobbyStatus.className = 'status-message';
        onlineNameInput.value = localStorage.getItem('onlinePlayerName') || '';
    }

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

    function setupSocketListeners() {
        if (!socket) return;

        // Remove previous listeners to avoid duplicates
        socket.off('room-created');
        socket.off('join-error');
        socket.off('player-joined');
        socket.off('start-error');
        socket.off('game-start');
        socket.off('guess-result');
        socket.off('invalid-guess');
        socket.off('not-your-turn');
        socket.off('game-over');
        socket.off('player-left');
        socket.off('back-to-lobby');
        socket.off('disconnect');

        // ── Room Created ──────────────────────
        socket.on('room-created', ({ roomCode, players }) => {
            currentRoomCode = roomCode;
            isHost = true;
            onlinePlayers = players;
            
            lobbyNameStep.style.display = 'none';
            lobbyWaitStep.style.display = 'block';
            roomCodeText.textContent = roomCode;
            updateLobbyPlayerList(players);
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
            btnStartOnline.disabled = players.length < 2;
            
            if (!isHost) {
                // Joined successfully — show wait screen
                lobbyNameStep.style.display = 'none';
                lobbyWaitStep.style.display = 'block';
                roomCodeText.textContent = currentRoomCode;
            }
        });

        // ── Start Error ───────────────────────
        socket.on('start-error', ({ message }) => {
            const status = document.getElementById('lobbyWaitStatus');
            status.textContent = message;
            status.className = 'status-message error';
        });

        // ── Game Start ────────────────────────
        socket.on('game-start', ({ minRange: mn, maxRange: mx, currentTurn, currentTurnIndex, players }) => {
            onlinePlayers = players;
            minRange = mn;
            maxRange = mx;
            currentTurnName = currentTurn;
            isGameOver = false;
            
            // Find my turn index
            myTurnIndex = players.indexOf(myPlayerName);
            
            historyLog.innerHTML = '';
            updateRangeUI();
            updateOnlineTurnUI(currentTurn);
            
            // Show room badge
            roomBadge.textContent = `🎮 ${currentRoomCode}`;
            roomBadge.style.display = 'inline-block';
            
            // Enable/disable input based on turn
            const isMyTurn = currentTurn === myPlayerName;
            guessInput.disabled = !isMyTurn;
            btnGuess.disabled = !isMyTurn;
            guessInput.value = '';
            
            showScreen(playScreen);
            if (isMyTurn) guessInput.focus();
        });

        // ── Guess Result ──────────────────────
        socket.on('guess-result', ({ playerName, guess, isHigher, minRange: mn, maxRange: mx, currentTurn }) => {
            minRange = mn;
            maxRange = mx;
            currentTurnName = currentTurn;
            
            addLog(null, guess, isHigher, playerName);
            updateRangeUI();
            updateOnlineTurnUI(currentTurn);
            
            const isMyTurn = currentTurn === myPlayerName;
            guessInput.disabled = !isMyTurn;
            btnGuess.disabled = !isMyTurn;
            guessInput.value = '';
            
            if (isMyTurn) guessInput.focus();
        });

        // ── Invalid Guess ─────────────────────
        socket.on('invalid-guess', ({ message }) => {
            alert(message);
        });

        // ── Not Your Turn ─────────────────────
        socket.on('not-your-turn', () => {
            const l = getLang();
            alert(l === 'en' ? 'Not your turn!' : 'Chưa đến lượt bạn!');
        });

        // ── Game Over ─────────────────────────
        socket.on('game-over', ({ winner, secretNumber, reason }) => {
            isGameOver = true;
            
            if (reason === 'opponent-left') {
                const l = getLang();
                const winVi = `🏆 ${winner} chiến thắng! (Đối thủ đã rời)`;
                const winEn = `🏆 ${winner} wins! (Opponent left)`;
                winnerMessage.setAttribute('data-vi', winVi);
                winnerMessage.setAttribute('data-en', winEn);
                winnerMessage.textContent = l === 'en' ? winEn : winVi;
            } else {
                endGame(null, secretNumber, winner);
            }
            
            secretNumberDisplay.textContent = secretNumber;
            showScreen(gameOverScreen);
            
            // Update restart button text for online mode
            const l = getLang();
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
        });

        // ── Player Left ───────────────────────
        socket.on('player-left', ({ playerName: leftPlayer, players, currentTurn, newHost }) => {
            onlinePlayers = players;
            isHost = (newHost === myPlayerName);
            
            // If in lobby, update player list
            if (lobbyScreen.classList.contains('active')) {
                updateLobbyPlayerList(players);
                btnStartOnline.disabled = players.length < 2;
            }
            
            // If in game, update turn
            if (playScreen.classList.contains('active') && currentTurn) {
                currentTurnName = currentTurn;
                updateOnlineTurnUI(currentTurn);
                const isMyTurn = currentTurn === myPlayerName;
                guessInput.disabled = !isMyTurn;
                btnGuess.disabled = !isMyTurn;
            }
            
            // Add system log
            const l = getLang();
            const p = document.createElement('p');
            p.style.color = '#ef4444';
            p.style.fontStyle = 'italic';
            p.textContent = l === 'en' ? `⚠️ ${leftPlayer} left the game` : `⚠️ ${leftPlayer} đã rời phòng`;
            if (historyLog.firstChild) {
                historyLog.insertBefore(p, historyLog.firstChild);
            }
        });

        // ── Back to Lobby ─────────────────────
        socket.on('back-to-lobby', ({ players }) => {
            onlinePlayers = players;
            showScreen(lobbyScreen);
            lobbyNameStep.style.display = 'none';
            lobbyWaitStep.style.display = 'block';
            updateLobbyPlayerList(players);
            btnStartOnline.disabled = players.length < 2;
        });

        // ── Disconnect ────────────────────────
        socket.on('disconnect', () => {
            if (!isGameOver && playScreen.classList.contains('active')) {
                const l = getLang();
                alert(l === 'en' ? 'Connection lost!' : 'Mất kết nối!');
                showScreen(setupScreen);
            }
        });
    }

    // ── Online Turn UI ──────────────────────────
    function updateOnlineTurnUI(turnPlayerName) {
        const isMe = turnPlayerName === myPlayerName;
        const l = getLang();
        
        const viStr = isMe ? `Lượt của bạn (${turnPlayerName})` : `Lượt của: ${turnPlayerName}`;
        const enStr = isMe ? `Your turn (${turnPlayerName})` : `Turn: ${turnPlayerName}`;
        
        turnIndicator.setAttribute('data-vi', viStr);
        turnIndicator.setAttribute('data-en', enStr);
        turnIndicator.textContent = l === 'en' ? enStr : viStr;
        
        // Visual highlight when it's your turn
        turnIndicator.style.background = isMe ? 'var(--primary-color)' : 'var(--text-color)';
        turnIndicator.style.color = isMe ? '#ffffff' : 'var(--bg-color)';
    }

    // ── Update lobby player list ────────────────
    function updateLobbyPlayerList(players) {
        lobbyPlayerList.innerHTML = '';
        players.forEach((name, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fa-solid fa-user"></i> ${name}`;
            if (i === 0) {
                li.innerHTML += `<span class="host-badge">HOST</span>`;
            }
            lobbyPlayerList.appendChild(li);
        });
    }

    // ── Send online guess ───────────────────────
    function sendOnlineGuess() {
        if (isGameOver || !socket) return;
        
        const guessStr = guessInput.value.trim();
        const guess = parseInt(guessStr);
        
        if (isNaN(guess) || guess <= minRange || guess >= maxRange) {
            const l = getLang();
            const msg = l === 'en' 
                ? `Please enter a number between ${minRange} and ${maxRange} (exclusive)!`
                : `Vui lòng nhập số trong khoảng ${minRange} - ${maxRange} (không bao gồm 2 đầu)!`;
            alert(msg);
            return;
        }
        
        socket.emit('guess', { number: guess });
        guessInput.value = '';
    }

    // ── Lobby button events ─────────────────────
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
            socket.emit('create-room', { playerName: name });
        } catch (e) {
            lobbyStatus.textContent = getLang() === 'en' 
                ? 'Cannot connect to server. Please try again.' 
                : 'Không thể kết nối server. Vui lòng thử lại.';
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
        
        if (!name) {
            lobbyStatus.textContent = getLang() === 'en' ? 'Please enter your name' : 'Vui lòng nhập tên';
            lobbyStatus.className = 'status-message error';
            return;
        }
        if (!code || code.length < 4) {
            lobbyStatus.textContent = getLang() === 'en' ? 'Please enter a valid room code' : 'Vui lòng nhập mã phòng hợp lệ';
            lobbyStatus.className = 'status-message error';
            return;
        }
        
        myPlayerName = name;
        currentRoomCode = code;
        localStorage.setItem('onlinePlayerName', name);
        
        try {
            await connectSocket();
            socket.emit('join-room', { roomCode: code, playerName: name });
        } catch (e) {
            lobbyStatus.textContent = getLang() === 'en' 
                ? 'Cannot connect to server. Please try again.' 
                : 'Không thể kết nối server. Vui lòng thử lại.';
            lobbyStatus.className = 'status-message error';
        }
    });

    btnBackToSetup.addEventListener('click', () => {
        disconnectSocket();
        showScreen(setupScreen);
    });

    btnStartOnline.addEventListener('click', () => {
        if (!isHost || !socket) return;
        socket.emit('start-game');
    });

    btnLeaveLobby.addEventListener('click', () => {
        disconnectSocket();
        showScreen(setupScreen);
    });

    // Copy room code
    roomCodeDisplay.addEventListener('click', () => {
        const code = roomCodeText.textContent;
        navigator.clipboard.writeText(code).then(() => {
            const hint = roomCodeDisplay.querySelector('.copy-hint');
            const original = hint.textContent;
            hint.textContent = getLang() === 'en' ? '✅ Copied!' : '✅ Đã sao chép!';
            hint.style.color = '#22c55e';
            setTimeout(() => {
                hint.textContent = original;
                hint.style.color = '';
            }, 2000);
        });
    });
});
