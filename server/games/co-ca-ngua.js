'use strict';

// ==================== CONSTANTS ====================

const NUM_PIECES = 4;
const TRACK_LENGTH = 52;
const HOME_COL_LENGTH = 5;
// Total steps to finish: 52 track + 5 home col + 1 center = 58
// piece.step: -1=home, 0-51=main track, 52-56=home col, 57=finished
const FINISH_STEP = 57;

const COLORS = ['red', 'blue', 'yellow', 'green'];
const COLOR_NAMES_VI = { red: 'Đỏ', blue: 'Xanh', yellow: 'Vàng', green: 'Lá' };

// Where each color enters the main track (global index)
const START_OFFSETS = { red: 0, blue: 13, yellow: 26, green: 39 };

// Safe squares (global indices) – starts + midpoints
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Main track: 52 cells clockwise
const MAIN_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],             // 0-4:  left arm → right
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],         // 5-10: top arm ← left col → up
  [0,7],[0,8],                                  // 11-12: top edge → right
  [1,8],[2,8],[3,8],[4,8],[5,8],               // 13-17: top arm right col → down
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],    // 18-23: right arm top → right
  [7,14],[8,14],                                // 24-25: right edge → down
  [8,13],[8,12],[8,11],[8,10],[8,9],           // 26-30: right arm bottom → left
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],    // 31-36: bottom arm right → down
  [14,7],[14,6],                                // 37-38: bottom edge → left
  [13,6],[12,6],[11,6],[10,6],[9,6],           // 39-43: bottom arm left → up
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],         // 44-49: left arm top → left
  [7,0],[6,0]                                   // 50-51: left edge → up
];

// Home columns: 5 cells leading toward center
const HOME_COLS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
  green:  [[13,7],[12,7],[11,7],[10,7],[9,7]]
};

// Piece display positions in home area (4 positions per color)
const HOME_POSITIONS = {
  red:    [[1,1],[1,3],[3,1],[3,3]],
  blue:   [[1,11],[1,13],[3,11],[3,13]],
  yellow: [[11,11],[11,13],[13,11],[13,13]],
  green:  [[11,1],[11,3],[13,1],[13,3]]
};

// ==================== HELPERS ====================

function getCell(color, piece) {
  if (piece.step === -1) return HOME_POSITIONS[color][piece.homeIdx];
  if (piece.step === FINISH_STEP) return [7, 7];
  if (piece.step >= TRACK_LENGTH) {
    const idx = piece.step - TRACK_LENGTH;
    return HOME_COLS[color][Math.min(idx, HOME_COL_LENGTH - 1)];
  }
  const globalIdx = (START_OFFSETS[color] + piece.step) % TRACK_LENGTH;
  return MAIN_PATH[globalIdx];
}

function isSafe(color, step) {
  if (step >= TRACK_LENGTH) return true; // home col always safe
  if (step < 0) return true;             // in home area
  return SAFE_SQUARES.has((START_OFFSETS[color] + step) % TRACK_LENGTH);
}

// Get valid move indices for a color given dice
function getValidMoves(pieces, color, dice) {
  const valid = [];
  const myPieces = pieces[color];

  for (let i = 0; i < NUM_PIECES; i++) {
    const p = myPieces[i];
    if (p.step === FINISH_STEP) continue; // already finished

    if (p.step === -1) {
      // In home: need 1 or 6 to exit
      if (dice === 1 || dice === 6) valid.push(i);
      continue;
    }

    const newStep = p.step + dice;
    if (newStep > FINISH_STEP) continue; // overshoot – invalid

    // For main track: check not blocked by own piece
    if (newStep < TRACK_LENGTH) {
      const newGlobal = (START_OFFSETS[color] + newStep) % TRACK_LENGTH;
      const blocked = myPieces.some((q, j) => j !== i && q.step >= 0 && q.step < TRACK_LENGTH &&
        (START_OFFSETS[color] + q.step) % TRACK_LENGTH === newGlobal);
      if (blocked) continue;
    }

    valid.push(i);
  }
  return valid;
}

// Find enemy pieces (not same color) on the same cell as (color, newStep)
function findEnemies(pieces, color, newStep) {
  if (newStep < 0 || newStep >= TRACK_LENGTH) return []; // home col / home area: no eating
  const targetGlobal = (START_OFFSETS[color] + newStep) % TRACK_LENGTH;
  if (SAFE_SQUARES.has(targetGlobal)) return []; // safe cell: no eating

  const eaten = [];
  for (const [enemyColor, enemyPieces] of Object.entries(pieces)) {
    if (enemyColor === color) continue;
    for (let i = 0; i < NUM_PIECES; i++) {
      const ep = enemyPieces[i];
      if (ep.step < 0 || ep.step >= TRACK_LENGTH) continue; // in home or home col: safe
      const epGlobal = (START_OFFSETS[enemyColor] + ep.step) % TRACK_LENGTH;
      if (epGlobal === targetGlobal) {
        eaten.push({ color: enemyColor, pieceIndex: i });
      }
    }
  }
  return eaten;
}

function countFinished(pieces, color) {
  return pieces[color].filter(p => p.step === FINISH_STEP).length;
}

function serializePieces(pieces) {
  const result = {};
  for (const [color, pArr] of Object.entries(pieces)) {
    result[color] = pArr.map(p => ({
      step: p.step,
      homeIdx: p.homeIdx,
      cell: getCell(color, p)
    }));
  }
  return result;
}

// ==================== GAME FUNCTIONS ====================

function startCoCaNguaGame(room, io, roomCode) {
  const playerCount = room.players.length;
  const assignedColors = COLORS.slice(0, playerCount);

  // Assign colors
  room.colorMap = {}; // socketId → color
  room.colorPlayerMap = {}; // color → player name
  assignedColors.forEach((color, i) => {
    room.colorMap[room.players[i].id] = color;
    room.colorPlayerMap[color] = room.players[i].name;
  });

  // Active colors (only those with players)
  room.activeColors = assignedColors;

  // Init pieces
  room.pieces = {};
  COLORS.forEach(color => {
    room.pieces[color] = Array.from({ length: NUM_PIECES }, (_, i) => ({
      step: -1,      // -1 = in home
      homeIdx: i
    }));
  });

  room.turnOrder = [...assignedColors];
  room.currentTurnIdx = 0;
  room.currentTurnColor = room.turnOrder[0];
  room.diceValue = null;
  room.diceRolled = false;
  room.consecutiveSixes = 0;
  room.finishedColors = []; // colors that have finished (all 4 pieces in)
  room.started = true;
  room.history = [];

  io.to(roomCode).emit('co-ca-ngua-start', {
    pieces: serializePieces(room.pieces),
    colorMap: room.colorMap,
    colorPlayerMap: room.colorPlayerMap,
    activeColors: room.activeColors,
    turnOrder: room.turnOrder,
    currentTurnColor: room.currentTurnColor,
    currentTurnPlayer: room.colorPlayerMap[room.currentTurnColor]
  });

  console.log(`[Game] Cờ Cá Ngựa Room ${roomCode} started with ${playerCount} players.`);
}

function handleCoCaNguaRoll(room, socket, io, roomCode) {
  if (!room || !room.started || room.gameType !== 'co-ca-ngua') return;

  const myColor = room.colorMap[socket.id];
  if (!myColor || myColor !== room.currentTurnColor) {
    socket.emit('not-your-turn');
    return;
  }
  if (room.diceRolled) {
    socket.emit('invalid-guess', { message: 'Đã tung rồi, hãy chọn quân!' });
    return;
  }

  const dice = Math.floor(Math.random() * 6) + 1;
  room.diceValue = dice;

  // 3 consecutive sixes = forfeit turn
  if (dice === 6) {
    room.consecutiveSixes += 1;
    if (room.consecutiveSixes >= 3) {
      room.consecutiveSixes = 0;
      room.diceRolled = false;
      room.diceValue = null;
      advanceTurn(room);
      io.to(roomCode).emit('co-ca-ngua-rolled', {
        dice,
        validMoves: [],
        currentTurnColor: room.currentTurnColor,
        currentTurnPlayer: room.colorPlayerMap[room.currentTurnColor],
        forcedSkip: true,
        reason: 'three-sixes'
      });
      return;
    }
  } else {
    room.consecutiveSixes = 0;
  }

  const validMoves = getValidMoves(room.pieces, myColor, dice);
  room.diceRolled = true;

  // Auto-skip if no valid moves
  if (validMoves.length === 0) {
    room.diceRolled = false;
    room.diceValue = null;
    if (dice !== 6) room.consecutiveSixes = 0;
    advanceTurn(room);
    io.to(roomCode).emit('co-ca-ngua-rolled', {
      dice,
      validMoves: [],
      currentTurnColor: room.currentTurnColor,
      currentTurnPlayer: room.colorPlayerMap[room.currentTurnColor],
      forcedSkip: true,
      reason: 'no-moves'
    });
    return;
  }

  io.to(roomCode).emit('co-ca-ngua-rolled', {
    dice,
    validMoves,
    currentTurnColor: myColor,
    currentTurnPlayer: room.colorPlayerMap[myColor],
    forcedSkip: false
  });
}

function handleCoCaNguaMove(room, socket, io, roomCode, { pieceIndex }) {
  if (!room || !room.started || room.gameType !== 'co-ca-ngua') return;

  const myColor = room.colorMap[socket.id];
  if (!myColor || myColor !== room.currentTurnColor) {
    socket.emit('not-your-turn');
    return;
  }
  if (!room.diceRolled) {
    socket.emit('invalid-guess', { message: 'Hãy tung xúc xắc trước!' });
    return;
  }

  const validMoves = getValidMoves(room.pieces, myColor, room.diceValue);
  if (!validMoves.includes(pieceIndex)) {
    socket.emit('invalid-guess', { message: 'Nước đi không hợp lệ!' });
    return;
  }

  const piece = room.pieces[myColor][pieceIndex];
  const dice = room.diceValue;
  const oldStep = piece.step;

  // Move piece
  if (piece.step === -1) {
    piece.step = 0; // Exit home
  } else {
    piece.step += dice;
  }

  room.diceRolled = false;
  room.diceValue = null;

  // Eat enemies
  const eaten = findEnemies(room.pieces, myColor, piece.step);
  const eatenInfo = [];
  for (const e of eaten) {
    room.pieces[e.color][e.pieceIndex].step = -1; // send back home
    eatenInfo.push({ color: e.color, pieceIndex: e.pieceIndex, playerName: room.colorPlayerMap[e.color] });
  }

  // Log
  const colorNameVI = COLOR_NAMES_VI[myColor];
  let logMsg = '';
  if (oldStep === -1) {
    logMsg = `🐴 ${room.colorPlayerMap[myColor]} (${colorNameVI}) đưa quân ra sân`;
  } else if (piece.step === FINISH_STEP) {
    logMsg = `🏁 ${room.colorPlayerMap[myColor]} (${colorNameVI}) đưa quân về đích!`;
  } else {
    logMsg = `🎲 ${room.colorPlayerMap[myColor]} (${colorNameVI}) di chuyển +${dice}`;
  }
  if (eatenInfo.length > 0) {
    logMsg += ` 💥 ăn quân ${eatenInfo.map(e => COLOR_NAMES_VI[e.color]).join(', ')}`;
  }
  room.history.push(logMsg);

  // Check if this color has all 4 pieces finished
  const finished = piece.step === FINISH_STEP && countFinished(room.pieces, myColor) === NUM_PIECES;
  if (finished && !room.finishedColors.includes(myColor)) {
    room.finishedColors.push(myColor);
  }

  // Check game over (only 1 active color remaining or all colors finished)
  const remainingColors = room.activeColors.filter(c => !room.finishedColors.includes(c));
  if (remainingColors.length <= 1) {
    // Game over
    if (remainingColors.length === 1 && !room.finishedColors.includes(remainingColors[0])) {
      room.finishedColors.push(remainingColors[0]); // last one loses
    }
    const rankings = room.finishedColors.map((c, i) => ({
      rank: i + 1,
      color: c,
      playerName: room.colorPlayerMap[c]
    }));
    room.started = false;
    io.to(roomCode).emit('co-ca-ngua-over', {
      rankings,
      pieces: serializePieces(room.pieces),
      history: room.history
    });
    return;
  }

  // Determine next turn
  // Roll 6 = extra turn (unless eaten gives extra)
  const extraTurn = (dice === 6) || (eatenInfo.length > 0);
  if (!extraTurn) {
    advanceTurn(room);
  }
  // If extra turn: consecutive sixes already tracked in roll handler

  io.to(roomCode).emit('co-ca-ngua-moved', {
    color: myColor,
    pieceIndex,
    pieces: serializePieces(room.pieces),
    eaten: eatenInfo,
    dice,
    extraTurn,
    currentTurnColor: room.currentTurnColor,
    currentTurnPlayer: room.colorPlayerMap[room.currentTurnColor],
    finishedColors: room.finishedColors,
    history: room.history
  });
}

function advanceTurn(room) {
  // Skip finished colors
  const total = room.turnOrder.length;
  let tries = 0;
  do {
    room.currentTurnIdx = (room.currentTurnIdx + 1) % total;
    tries++;
  } while (room.finishedColors.includes(room.turnOrder[room.currentTurnIdx]) && tries < total);
  room.currentTurnColor = room.turnOrder[room.currentTurnIdx];
}

function resetCoCaNguaGame(room) {
  room.pieces = null;
  room.colorMap = {};
  room.colorPlayerMap = {};
  room.activeColors = [];
  room.turnOrder = [];
  room.currentTurnIdx = 0;
  room.currentTurnColor = null;
  room.diceValue = null;
  room.diceRolled = false;
  room.consecutiveSixes = 0;
  room.finishedColors = [];
  room.started = false;
  room.history = [];
}

function endCoCaNguaBecauseOpponentLeft(room, io, roomCode) {
  const winner = room.players[0];
  io.to(roomCode).emit('co-ca-ngua-over', {
    rankings: [{ rank: 1, color: room.colorMap[winner?.id] || 'red', playerName: winner?.name || 'Unknown' }],
    pieces: room.pieces ? serializePieces(room.pieces) : {},
    reason: 'opponent-left'
  });
  room.started = false;
}

module.exports = {
  startCoCaNguaGame,
  handleCoCaNguaRoll,
  handleCoCaNguaMove,
  resetCoCaNguaGame,
  endCoCaNguaBecauseOpponentLeft,
  MAIN_PATH,
  HOME_COLS,
  HOME_POSITIONS,
  SAFE_SQUARES,
  START_OFFSETS
};
