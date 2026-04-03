const EMOJIS = [
  // Fruits (16)
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🍌',
  '🥝', '🍍', '🥭', '🍈', '🫐', '🍐', '🥥', '🍉',
  // Animals (16)
  '🐶', '🐱', '🐼', '🦊', '🐸', '🐵', '🦁', '🐯',
  '🐰', '🐻', '🐨', '🦄', '🐷', '🐙', '🦋', '🐢'
]; // 32 items
const DISTRACTION_EMOJI = '💣';

function shuffleDeck(pairCount, totalCards) {
  const selected = EMOJIS.slice(0, pairCount);
  const deck = [...selected, ...selected];
  
  if (totalCards > deck.length) {
    deck.push(DISTRACTION_EMOJI);
  }
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function startMemoryTurnTimer(room, io, roomCode) {
  if (room.memoryGame.turnTimeout) {
    clearTimeout(room.memoryGame.turnTimeout);
  }

  const turnDuration = 15000;

  io.to(roomCode).emit('turn-updated', {
    currentTurn: room.players[room.currentTurnIndex].name,
    currentTurnIndex: room.currentTurnIndex,
    turnStartTime: Date.now(),
    turnDuration: turnDuration,
    hints: room.memoryGame.hints
  });

  room.memoryGame.turnTimeout = setTimeout(() => {
    handleMemoryTimeout(room, io, roomCode);
  }, turnDuration);
}

function handleMemoryTimeout(room, io, roomCode) {
  if (!room.started || !room.memoryGame) return;
  const { memoryGame } = room;

  // If a card was flipped, unflip it
  if (memoryGame.flipped.length > 0) {
    const firstIndex = memoryGame.flipped[0];
    const secondIndex = memoryGame.flipped[1] !== undefined ? memoryGame.flipped[1] : null;
    io.to(roomCode).emit('memory-unflip', {
      firstIndex,
      secondIndex
    });
  }

  memoryGame.flipped = [];
  memoryGame.processingFlip = false;

  // Pass to the next player
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  startMemoryTurnTimer(room, io, roomCode);
}

function startMemoryGame(room, io, roomCode) {
  room.started = true;
  room.currentTurnIndex = 0;
  
  const initialScores = {};
  const initialHints = {};
  room.players.forEach(p => {
    initialScores[p.name] = 0;
    initialHints[p.name] = 1;
  });

  let columns = 6, rows = 6;
  if (room.players.length === 3) {
    columns = 7; rows = 7;
  } else if (room.players.length === 4) {
    columns = 8; rows = 8;
  }
  
  const boardSize = columns * rows;
  const pairCount = Math.floor(boardSize / 2);

  room.memoryGame = {
    deck: shuffleDeck(pairCount, boardSize),
    flipped: [], 
    matched: [], 
    scores: initialScores,
    hints: initialHints,
    processingFlip: false,
    turnTimeout: null,
    boardSize: boardSize,
    pairCount: pairCount,
    columns: columns,
    rows: rows
  };

  io.to(roomCode).emit('game-started', {
    gameType: 'memory',
    currentTurn: room.players[room.currentTurnIndex].name,
    currentTurnIndex: room.currentTurnIndex,
    boardSize: boardSize,
    columns: columns,
    rows: rows,
    scores: initialScores,
    hints: initialHints
  });

  startMemoryTurnTimer(room, io, roomCode);
}

function handleMemoryFlip(room, socket, io, roomCode, { cardIndex }) {
  if (!room.started || !room.memoryGame) return;
  if (room.memoryGame.processingFlip) return;
  if (room.players[room.currentTurnIndex].id !== socket.id) {
    socket.emit('play-error', { message: 'Không phải lượt của bạn / Not your turn' });
    return;
  }

  const { memoryGame } = room;
  
  if (memoryGame.flipped.includes(cardIndex)) return;
  if (memoryGame.matched.includes(cardIndex)) return;
  
  memoryGame.flipped.push(cardIndex);
  
  io.to(roomCode).emit('memory-card-flipped', {
    cardIndex,
    emoji: memoryGame.deck[cardIndex],
    playerName: socket.playerName
  });
  
  if (memoryGame.flipped.length === 2) {
    if (memoryGame.turnTimeout) clearTimeout(memoryGame.turnTimeout);
    memoryGame.processingFlip = true;
    const [firstIndex, secondIndex] = memoryGame.flipped;
    
    if (memoryGame.deck[firstIndex] === memoryGame.deck[secondIndex]) {
      // Match
      memoryGame.matched.push(firstIndex, secondIndex);
      memoryGame.scores[socket.playerName] += 1;
      
      setTimeout(() => {
        io.to(roomCode).emit('memory-match', {
          firstIndex,
          secondIndex,
          scorer: socket.playerName,
          scores: memoryGame.scores,
          hints: memoryGame.hints
        });
        
        memoryGame.flipped = [];
        memoryGame.processingFlip = false;
        
        if (memoryGame.matched.length === memoryGame.pairCount * 2) {
          endMemoryGameNormally(room, io, roomCode);
        } else {
          // Same player continues turn
          startMemoryTurnTimer(room, io, roomCode);
        }
      }, 1000); 
    } else {
      // No match
      setTimeout(() => {
        io.to(roomCode).emit('memory-unflip', {
          firstIndex,
          secondIndex
        });
        
        memoryGame.flipped = [];
        memoryGame.processingFlip = false;
        
        // Switch turn
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        startMemoryTurnTimer(room, io, roomCode);
      }, 1300);
    }
  }
}

function handleMemoryUseHint(room, socket, io, roomCode) {
  if (!room.started || !room.memoryGame) return;
  if (room.memoryGame.processingFlip) return;
  if (room.players[room.currentTurnIndex].id !== socket.id) return;
  
  const { memoryGame } = room;

  // Need exactly 1 card flipped to use hint
  if (memoryGame.flipped.length !== 1) {
    socket.emit('play-error', { message: 'Cần lật 1 lá bài trước để dùng gợi ý!' });
    return;
  }

  // Check if player has hints
  if (memoryGame.hints[socket.playerName] <= 0) return;

  if (memoryGame.turnTimeout) clearTimeout(memoryGame.turnTimeout);
  memoryGame.processingFlip = true;
  
  const firstIndex = memoryGame.flipped[0];
  const targetEmoji = memoryGame.deck[firstIndex];
  
  if (targetEmoji === DISTRACTION_EMOJI) {
    socket.emit('play-error', { message: 'Ô đánh lạc hướng không có cặp để dùng gợi ý!' });
    return;
  }
  
  // Find matching card index
  let secondIndex = -1;
  for (let i = 0; i < memoryGame.deck.length; i++) {
    if (i !== firstIndex && memoryGame.deck[i] === targetEmoji && !memoryGame.matched.includes(i)) {
      secondIndex = i;
      break;
    }
  }

  if (secondIndex === -1) {
    memoryGame.processingFlip = false;
    return; // Should theoretically never happen
  }

  // Mark as used
  memoryGame.hints[socket.playerName] -= 1;
  memoryGame.flipped.push(secondIndex);
  memoryGame.matched.push(firstIndex, secondIndex);
  memoryGame.scores[socket.playerName] += 1;

  // Emit the magic flip
  io.to(roomCode).emit('memory-card-flipped', {
    cardIndex: secondIndex,
    emoji: targetEmoji,
    playerName: socket.playerName + ' 💡 (Hint)'
  });

  setTimeout(() => {
    io.to(roomCode).emit('memory-match', {
      firstIndex,
      secondIndex,
      scorer: socket.playerName,
      scores: memoryGame.scores,
      hints: memoryGame.hints
    });
    
    memoryGame.flipped = [];
    memoryGame.processingFlip = false;
    
    if (memoryGame.matched.length === memoryGame.pairCount * 2) {
      endMemoryGameNormally(room, io, roomCode);
    } else {
      // Logic: turn passes to NEXT player when hint is used!
      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
      startMemoryTurnTimer(room, io, roomCode);
    }
  }, 1000);
}

function endMemoryGameNormally(room, io, roomCode) {
  if (room.memoryGame.turnTimeout) clearTimeout(room.memoryGame.turnTimeout);
  
  let maxScore = -1;
  let winners = [];
  
  for (const [playerId, score] of Object.entries(room.memoryGame.scores)) {
    if (score > maxScore) {
      maxScore = score;
      winners = [playerId];
    } else if (score === maxScore) {
      winners.push(playerId);
    }
  }

  let winnerName = 'Hòa / Draw';
  if (winners.length === 1) {
    winnerName = winners[0];
  } else if (winners.length > 1 && winners.length < room.players.length) {
    winnerName = winners.join(', ');
  }

  io.to(roomCode).emit('game-ended', {
    winner: winnerName,
    status: 'win'
  });
  room.started = false;
}

function resetMemoryGame(room) {
  room.started = false;
  room.currentTurnIndex = 0;
  if(room.players.length >= 2) {
    const initialScores = {};
    const initialHints = {};
    room.players.forEach(p => {
      initialScores[p.name] = 0;
      initialHints[p.name] = 1;
    });

    let columns = 6, rows = 6;
    if (room.players.length === 3) {
      columns = 7; rows = 7;
    } else if (room.players.length === 4) {
      columns = 8; rows = 8;
    }
    
    const boardSize = columns * rows;
    const pairCount = Math.floor(boardSize / 2);

    room.memoryGame = {
        deck: shuffleDeck(pairCount, boardSize),
        flipped: [],
        matched: [],
        scores: initialScores,
        hints: initialHints,
        processingFlip: false,
        turnTimeout: null,
        boardSize: boardSize,
        pairCount: pairCount,
        columns: columns,
        rows: rows
    };
  } else {
     room.memoryGame = null;
  }
}

function endMemoryBecauseOpponentLeft(room, io, code) {
  if (room.memoryGame && room.memoryGame.turnTimeout) {
    clearTimeout(room.memoryGame.turnTimeout);
  }
  room.started = false;
  io.to(code).emit('game-ended', { 
    winner: room.players[0]?.name || 'Đối thủ', 
    status: 'opponent-left' 
  });
}

module.exports = {
  startMemoryGame,
  handleMemoryFlip,
  resetMemoryGame,
  endMemoryBecauseOpponentLeft,
  handleMemoryUseHint
};
