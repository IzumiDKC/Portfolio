const EMOJIS = [
  '🍎', '🍌', '🍒', '🍇', '🍉', '🍓', '🥥', '🥝',
  '🍍', '🥭', '🍑', '🍋', '🍈', '🍏', '🍐', '🍊',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐯', '🦁', '🐮', '🐷', '🐸', '🐒', '🐔', '🐧'
];

function shuffleDeck() {
  const deck = [...EMOJIS, ...EMOJIS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function startMemoryGame(room, io, roomCode) {
  room.started = true;
  room.currentTurnIndex = 0;
  
  room.memoryGame = {
    deck: shuffleDeck(),
    flipped: [], 
    matched: [], 
    scores: {
      [room.players[0].id]: 0,
      [room.players[1].id]: 0
    },
    processingFlip: false
  };

  io.to(roomCode).emit('game-started', {
    gameType: 'memory',
    currentTurn: room.players[room.currentTurnIndex].name,
    currentTurnIndex: room.currentTurnIndex,
    boardSize: 64
  });
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
    memoryGame.processingFlip = true;
    const [firstIndex, secondIndex] = memoryGame.flipped;
    
    if (memoryGame.deck[firstIndex] === memoryGame.deck[secondIndex]) {
      // Match
      memoryGame.matched.push(firstIndex, secondIndex);
      memoryGame.scores[socket.id] += 1;
      
      setTimeout(() => {
        io.to(roomCode).emit('memory-match', {
          firstIndex,
          secondIndex,
          scorer: socket.playerName,
          scores: {
            player1: memoryGame.scores[room.players[0].id],
            player2: memoryGame.scores[room.players[1].id]
          }
        });
        
        memoryGame.flipped = [];
        memoryGame.processingFlip = false;
        
        if (memoryGame.matched.length === 64) {
          const score1 = memoryGame.scores[room.players[0].id];
          const score2 = memoryGame.scores[room.players[1].id];
          let winnerName = 'Hòa / Draw';
          if (score1 > score2) winnerName = room.players[0].name;
          else if (score2 > score1) winnerName = room.players[1].name;
          
          io.to(roomCode).emit('game-ended', {
            winner: winnerName,
            status: 'win'
          });
          room.started = false;
        } else {
             // Let the same player continue their turn
            io.to(roomCode).emit('turn-updated', {
              currentTurn: room.players[room.currentTurnIndex].name,
              currentTurnIndex: room.currentTurnIndex,
            });
        }
      }, 1000); // Wait 1 second before resolving visually
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
        io.to(roomCode).emit('turn-updated', {
          currentTurn: room.players[room.currentTurnIndex].name,
          currentTurnIndex: room.currentTurnIndex,
        });
      }, 1300); // slightly longer wait to let players memorize
    }
  }
}

function resetMemoryGame(room) {
  room.started = false;
  room.currentTurnIndex = 0;
  if(room.players.length >= 2) {
    room.memoryGame = {
        deck: shuffleDeck(),
        flipped: [],
        matched: [],
        scores: {
            [room.players[0].id]: 0,
            [room.players[1].id]: 0
        },
        processingFlip: false
    };
  } else {
     room.memoryGame = null;
  }
}

function endMemoryBecauseOpponentLeft(room, io, code) {
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
  endMemoryBecauseOpponentLeft
};
