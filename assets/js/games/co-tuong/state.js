export function createCoTuongState() {
  return {
    // Game board: 10×9 array of {type, color} | null
    board: [],
    isGameOver: false,
    selectedPiece: null,   // { row, col }
    validMoves: [],        // [[r,c], ...]
    lastMove: null,        // { fromRow, fromCol, toRow, toCol }
    inCheck: false,

    // Mode
    isAiMode: false,
    aiDifficulty: 'medium', // 'easy' | 'medium' | 'hard'
    myColor: 'r',           // 'r' | 'b'
    isPlayerTurn: true,
    currentTurnColor: 'r',  // red always goes first

    // Online multiplayer
    socket: null,
    currentRoomCode: null,
    myPlayerName: '',
    isHost: false,
    onlinePlayers: [],
    currentTurnName: '',
    playerTimes: [300, 300] // [red, black]
  };
}
