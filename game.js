document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const setupScreen = document.getElementById('setupScreen');
    const playScreen = document.getElementById('playScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
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

    // Game variables
    let minRange = 0;
    let maxRange = 1000;
    let secretAmount = 0;
    let mode = 'bot'; // 'bot' or 'multi'
    let totalPlayers = 2; // For multi: N players. For bot: 2 (Player=1, Bot=2)
    let currentPlayer = 1;
    let isGameOver = false;

    // Remove old lang listeners if they existed
    const langToggleBtn = document.getElementById('langToggle');

    // Setup input toggling
    gameModeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'multi') {
            playerCountGroup.style.display = 'block';
        } else {
            playerCountGroup.style.display = 'none';
        }
    });

    btnStart.addEventListener('click', () => {
        mode = gameModeSelect.value;
        if (mode === 'multi') {
            totalPlayers = parseInt(playerCountInput.value) || 2;
            if (totalPlayers < 2) totalPlayers = 2;
            if (totalPlayers > 10) totalPlayers = 10;
        } else {
            totalPlayers = 2;
        }
        startGame();
    });

    btnGuess.addEventListener('click', () => processGuess(null));

    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processGuess(null);
        }
    });

    btnRestart.addEventListener('click', () => {
        gameOverScreen.classList.remove('active');
        setupScreen.classList.add('active');
    });

    function startGame() {
        minRange = 0;
        maxRange = 1000;
        secretAmount = Math.floor(Math.random() * 1001); // 0 to 1000
        currentPlayer = 1;
        isGameOver = false;
        
        historyLog.innerHTML = '';
        updateRangeUI();
        updateTurnUI();
        guessInput.value = '';
        guessInput.disabled = false;
        btnGuess.disabled = false;
        
        setupScreen.classList.remove('active');
        playScreen.classList.add('active');
        guessInput.focus();
        
        // Let lang system do an initial pass if needed, but inner texts handle it
        if(window._iyu && typeof window._iyu.getLang === 'function'){
            triggerLangUpdate(window._iyu.getLang());
        }
    }

    function processGuess(botGuessVal = null) {
        if (isGameOver) return;

        let guessStr = guessInput.value.trim();
        let guess = botGuessVal !== null ? botGuessVal : parseInt(guessStr);
        
        if (isNaN(guess) || guess < minRange || guess > maxRange) {
            const l = document.documentElement.getAttribute('data-lang') || 'vi';
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

        // Adjust bounds
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
            let botGuess = minBound + 1; // force guess inside
            processGuess(botGuess);
            return;
        }

        // Smart random
        let botGuess = Math.floor(Math.random() * (maxBound - minBound - 1)) + minBound + 1;
        processGuess(botGuess);
    }

    function updateRangeUI() {
        minValSpan.textContent = minRange;
        maxValSpan.textContent = maxRange;
        
        // Pop effect
        rangeDisplay.classList.remove('pop');
        void rangeDisplay.offsetWidth; // trigger reflow
        rangeDisplay.classList.add('pop');
        
        // Remove class after animation
        setTimeout(() => {
            rangeDisplay.classList.remove('pop');
        }, 300);
    }

    function updateTurnUI() {
        const viStr = mode === 'bot' && currentPlayer===2 ? 'Máy (Bot)' : (mode === 'bot' && currentPlayer===1 ? 'Bạn' : `Người chơi ${currentPlayer}`);
        const enStr = mode === 'bot' && currentPlayer===2 ? 'Bot' : (mode === 'bot' && currentPlayer===1 ? 'You' : `Player ${currentPlayer}`);
        
        turnIndicator.setAttribute('data-vi', `Lượt của: ${viStr}`);
        turnIndicator.setAttribute('data-en', `Turn: ${enStr}`);
        
        const l = document.documentElement.getAttribute('data-lang') || 'vi';
        turnIndicator.textContent = l === 'en' ? `Turn: ${enStr}` : `Lượt của: ${viStr}`;
    }

    function addLog(playerNum, guessVal, isUp) {
        const pStrVi = playerNum === 1 ? (mode === 'bot' ? 'Bạn' : 'Người chơi 1') : (mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${playerNum}`);
        const pStrEn = playerNum === 1 ? (mode === 'bot' ? 'You' : 'Player 1') : (mode === 'bot' ? 'Bot' : `Player ${playerNum}`);
        
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
        
        const l = document.documentElement.getAttribute('data-lang') || 'vi';
        p.innerHTML = l === 'en' ? enHtml : viHtml;
        
        historyLog.insertBefore(p, historyLog.firstChild);
    }

    function endGame(winningPlayerNum, correctNumber) {
        isGameOver = true;
        playScreen.classList.remove('active');
        gameOverScreen.classList.add('active');
        
        const pStrVi = winningPlayerNum === 1 ? (mode === 'bot' ? 'Bạn' : 'Người chơi 1') : (mode === 'bot' ? 'Máy (Bot)' : `Người chơi ${winningPlayerNum}`);
        const pStrEn = winningPlayerNum === 1 ? (mode === 'bot' ? 'You' : 'Player 1') : (mode === 'bot' ? 'Bot' : `Player ${winningPlayerNum}`);
        
        const winVi = `🎉 ${pStrVi} chiến thắng!`;
        const winEn = `🎉 ${pStrEn} wins!`;
        
        winnerMessage.setAttribute('data-vi', winVi);
        winnerMessage.setAttribute('data-en', winEn);
        
        const l = document.documentElement.getAttribute('data-lang') || 'vi';
        winnerMessage.textContent = l === 'en' ? winEn : winVi;
        
        secretNumberDisplay.textContent = correctNumber;
    }
    
    function triggerLangUpdate(l) {
        // Tự dịch lại toàn bộ log và các element động khi đổi lang
        document.querySelectorAll('[data-vi]').forEach(el => {
            const v = el.getAttribute('data-' + l);
            if(v !== null) el.innerHTML = v;
        });
    }

    // Attach to the existing lang toggle logic via observer or explicit listener
    // We'll just hook into the click event of langToggle to re-trigger innerHTMLs
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            // Need to wait slightly for lang.js to update the Document's `data-lang`
            requestAnimationFrame(() => {
                const l = document.documentElement.getAttribute('data-lang') || 'vi';
                triggerLangUpdate(l);
            });
        });
    }
});
