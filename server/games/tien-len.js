function createDeck() {
    let deck = [];
    // Suits: 0 = Bích, 1 = Chuồn, 2 = Rô, 3 = Cơ
    // Ranks: 3 -> 15 (11=J, 12=Q, 13=K, 14=A, 15=2)
    // Mỗi lá bài có giá trị = rank * 10 + suit
    // Vd: 3 Bích = 30, 2 Cơ = 153.
    for (let r = 3; r <= 15; r++) {
        for (let s = 0; s < 4; s++) {
            deck.push(r * 10 + s);
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function isStraight(ranks) {
    if (ranks.length < 3) return false;
    for (let r of ranks) {
        if (r === 15) return false; // Không xếp 2 vào sảnh
    }
    for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] !== ranks[i-1] + 1) return false;
    }
    return true;
}

function isConsecutivePairs(ranks) {
    if (ranks.length % 2 !== 0) return false;
    for (let i = 0; i < ranks.length; i += 2) {
        if (ranks[i] !== ranks[i+1]) return false; 
        if (ranks[i] === 15) return false; // Không chơi đôi 2 trong thông
        if (i > 0) {
           if (ranks[i] !== ranks[i-2] + 1) return false; 
        }
    }
    return true;
}

function getHandType(cards) {
    let n = cards.length;
    if (n === 0) return null;
    
    let sortedCards = [...cards].sort((a, b) => a - b);
    if (n === 1) return { type: 'single', maxCard: sortedCards[0], length: 1, cards: sortedCards };
    
    let ranks = sortedCards.map(c => Math.floor(c / 10));
    let uniqueRanks = [...new Set(ranks)];

    if (n === 2) {
        if (uniqueRanks.length === 1) return { type: 'pair', maxCard: sortedCards[1], length: 2, cards: sortedCards };
        return null;
    }
    
    if (n === 3) {
        if (uniqueRanks.length === 1) return { type: 'triple', maxCard: sortedCards[2], length: 3, cards: sortedCards };
        if (isStraight(ranks)) return { type: 'straight', maxCard: sortedCards[2], length: 3, cards: sortedCards };
        return null;
    }

    if (n === 4) {
        if (uniqueRanks.length === 1) return { type: 'four', maxCard: sortedCards[3], length: 4, cards: sortedCards };
        if (isStraight(ranks)) return { type: 'straight', maxCard: sortedCards[3], length: 4, cards: sortedCards };
        return null;
    }
    
    if (isStraight(ranks)) {
        return { type: 'straight', maxCard: sortedCards[n-1], length: n, cards: sortedCards };
    }
    
    if (n === 6 || n === 8) {
        if (isConsecutivePairs(ranks)) {
            return { type: n === 6 ? 'three-pairs' : 'four-pairs', maxCard: sortedCards[n-1], length: n, cards: sortedCards };
        }
    }
    return null;
}

function validateMove(cardsPlay, lastMove) {
    let playInfo = getHandType(cardsPlay);
    if (!playInfo) return false;

    if (!lastMove) return playInfo; // Đánh đầu vòng

    // Cùng loại, cùng số lượng
    if (playInfo.type === lastMove.type && playInfo.length === lastMove.length) {
        return playInfo.maxCard > lastMove.maxCard ? playInfo : false;
    }

    // Luật chặt chém (Chặt heo)
    let lastRank = Math.floor(lastMove.maxCard / 10);
    
    // Đang có 1 con heo trên bàn
    if (lastMove.type === 'single' && lastRank === 15) {
        if (playInfo.type === 'three-pairs' || playInfo.type === 'four' || playInfo.type === 'four-pairs') {
            return playInfo;
        }
    }

    // Đang có đôi heo trên bàn
    if (lastMove.type === 'pair' && lastRank === 15) {
        if (playInfo.type === 'four' || playInfo.type === 'four-pairs') {
            return playInfo;
        }
    }

    // Chặt 3 đôi thông bằng tứ quý, 4 đôi thông
    if (lastMove.type === 'three-pairs') {
        if (playInfo.type === 'four' || playInfo.type === 'four-pairs') {
            return playInfo;
        }
    }

    // Chặt tứ quý bằng 4 đôi thông
    if (lastMove.type === 'four') {
        if (playInfo.type === 'four-pairs') {
             return playInfo;
        }
    }

    return false;
}

// Hệ thống tính điểm & Lịch sử
function initHistoryIfNeeded(room) {
    if (!room.history) {
        room.history = [];
    }
}

// Hệ thống tính giờ
function clearTurnTimer(room) {
    if (room.turnTimeout) {
        clearTimeout(room.turnTimeout);
        room.turnTimeout = null;
    }
}

function startTurnTimer(room, io, code) {
    clearTurnTimer(room);
    room.turnStartTime = Date.now();
    room.turnLimit = 30000; // 30s

    room.turnTimeout = setTimeout(() => {
        // Hết thời gian: tự động đánh hoặc bỏ lượt
        const player = room.players[room.currentTurnIndex];
        if (!player) return;

        // Tạo object socket ảo để tận dụng logic có sẵn
        const dummySocket = {
            id: player.id,
            emit: (event, data) => {
                // Không làm gì thiết thực, chỉ để pass logic
                console.log(`[Auto] Event ${event} to ${player.name}:`, data);
            }
        };

        if (!room.lastMove) {
            // Đánh đầu vòng: bốc lá nhỏ nhất
            if (player.hand.length > 0) {
                let lowestCard = player.hand[0];
                handleTienLenMove(room, dummySocket, io, code, { cards: [lowestCard] });
            }
        } else {
            // Đã có bài trên bàn: bỏ lượt
            handleTienLenPass(room, dummySocket, io, code);
        }
    }, room.turnLimit);
}

// Bắt đầu game
function startTienLenGame(room, io, code) {
    initHistoryIfNeeded(room);

    let deck = createDeck();
    shuffle(deck);

    room.started = true;
    room.lastMove = null;
    room.passedPlayers = []; 
    
    // Chia 13 lá bài
    room.players.forEach(p => {
        p.hand = deck.splice(0, 13);
        p.hand.sort((a,b) => a - b);
    });

    // Ai đi trước?
    let starterIndex = -1;

    // Xét người thắng ván trước nếu họ còn trong phòng
    if (room.previousWinnerId) {
        const winnerIndex = room.players.findIndex(p => p.id === room.previousWinnerId);
        if (winnerIndex !== -1) {
            starterIndex = winnerIndex;
        }
    }

    // Nếu không ai cạp quyền, chọn người giữ lá nhỏ nhất
    if (starterIndex === -1) {
        let lowestCard = 999;
        room.players.forEach((p, index) => {
            if (p.hand.length > 0 && p.hand[0] < lowestCard) {
                lowestCard = p.hand[0];
                starterIndex = index;
            }
        });
    }

    room.currentTurnIndex = starterIndex;

    io.to(code).emit('game-started', { gameType: 'tien-len' });

    syncTienLenState(room, io, code);
}

function nextTurn(room) {
    // Chuyển lượt sang người kế tiếp chưa pass
    for (let i = 1; i < room.players.length; i++) {
        let nxt = (room.currentTurnIndex + i) % room.players.length;
        if (!room.passedPlayers.includes(room.players[nxt].id) && room.players[nxt].hand.length > 0) {
            room.currentTurnIndex = nxt;
            return;
        }
    }
}

function syncTienLenState(room, io, code) {
    // Luôn reset timer mỗi khi đồng bộ trạng thái mới
    // Bởi vì đồng bộ thường xảy ra sau 1 nước đi hoặc vòng mới
    startTurnTimer(room, io, code);

    // Thông tin mỗi người nhìn thấy về đối thủ
    const publicPlayers = room.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        hasPassed: room.passedPlayers.includes(p.id)
    }));

    room.players.forEach(p => {
        io.to(p.id).emit('tien-len-state', {
            players: publicPlayers,
            turnId: room.players[room.currentTurnIndex]?.id,
            lastMove: room.lastMove,
            myHand: p.hand,
            turnStartTime: room.turnStartTime,
            turnLimit: room.turnLimit
        });
    });
}

function handleTienLenMove(room, socket, io, code, { cards }) {
    if (room.players[room.currentTurnIndex].id !== socket.id) {
        socket.emit('play-error', { message: 'Không phải lượt của bạn' });
        return;
    }

    const player = room.players.find(p => p.id === socket.id);
    
    // Khách gửi lên danh sách các mã bài (vd: [30, 31])
    // Kiểm tra xem bài này có trong tay người chơi không
    for (let c of cards) {
        if (!player.hand.includes(c)) {
            socket.emit('play-error', { message: 'Bạn không có lá bài này' });
            return;
        }
    }

    const playResult = validateMove(cards, room.lastMove);
    if (!playResult) {
        socket.emit('play-error', { message: 'Nước đi không hợp lệ' });
        return;
    }

    // Đánh hợp lệ
    playResult.ownerId = socket.id;
    room.lastMove = playResult;

    // Trừ bài trên tay
    player.hand = player.hand.filter(c => !cards.includes(c));

    // Reset passed list (đây là đánh đè)
    // Nhưng người nào hết bài thì không thêm vào passed, để họ chờ
    // Chờ tí, vòng chơi (round) không reset passedPlayers khi bị đè. 
    // Người chặt vẫn giữ vòng cho đến khi tất cả bị chặn hết.

    io.to(code).emit('tien-len-played', {
        playerName: player.name,
        cards: playResult.cards
    });

    if (player.hand.length === 0) {
        clearTurnTimer(room);

        // Ghi lại lịch sử
        room.previousWinnerId = player.id;
        room.history.push({ 
            winner: player.name, 
            time: new Date().toISOString() 
        });

        // Sync trạng thái cuối trước khi công bố thắng để mọi người thấy lá bài cuối trên bàn
        room.lastMove = playResult; // Redundant but safe
        syncTienLenState(room, io, code);
        clearTurnTimer(room); // Phải clear lại vì sync lại bật timer

        // Gom các lá bài còn dư của người thua
        const allHands = room.players.map(p => ({
            id: p.id,
            name: p.name,
            hand: p.hand,
            cardCount: p.hand.length
        }));

        io.to(code).emit('tien-len-ended', { 
            winner: player.name, 
            hands: allHands,
            history: room.history
        });
        room.started = false;
        return;
    }

    nextTurn(room);
    syncTienLenState(room, io, code);
}

function handleTienLenPass(room, socket, io, code) {
    if (room.players[room.currentTurnIndex].id !== socket.id) {
        socket.emit('play-error', { message: 'Không phải lượt của bạn' });
        return;
    }

    if (!room.lastMove) {
        socket.emit('play-error', { message: 'Bạn là người đánh đầu vòng, không thể bỏ lượt' });
        return;
    }

    room.passedPlayers.push(socket.id);

    // Kiểm tra xem vòng đã kết thúc chưa
    // Số người chưa pass = tổng số người còn bài - tổng số người pass
    let activePlayers = room.players.filter(p => p.hand.length > 0 && !room.passedPlayers.includes(p.id));

    if (activePlayers.length <= 1) {
        // Vòng mới
        room.lastMove = null;
        room.passedPlayers = [];
        
        let turnPlayer = activePlayers.length === 1 ? activePlayers[0] : room.players.find(p => p.id === socket.id); // Tránh lỗi
        if(activePlayers.length === 1) {
            room.currentTurnIndex = room.players.findIndex(p => p.id === activePlayers[0].id);
        } else {
            // Trường hợp hy hữu người đánh bài cuối cùng rỗng tay và tất cả pass
            // Người kế tiếp sẽ đi mới
            nextTurn(room);
        }

        io.to(code).emit('tien-len-new-round', {});
    } else {
        nextTurn(room);
    }

    syncTienLenState(room, io, code);
}

function endTienLenBecauseOpponentLeft(room, io, code) {
    io.to(code).emit('game-ended-disconnect', {
        message: 'Một người chơi đã thoát, trò chơi kết thúc.'
    });
    resetTienLenGame(room);
}

function resetTienLenGame(room) {
    clearTurnTimer(room);
    room.started = false;
    room.currentTurnIndex = 0;
    room.lastMove = null;
    room.passedPlayers = [];
    room.players.forEach((p) => { p.hand = []; });
}


module.exports = {
    startTienLenGame,
    handleTienLenMove,
    handleTienLenPass,
    endTienLenBecauseOpponentLeft,
    resetTienLenGame
};
