export function createCaroState() {
  return {
    // Online multiplayer
    board: [],
    isGameOver: false,
    socket: null,
    currentRoomCode: null,
    myPlayerName: '',
    isHost: false,
    onlinePlayers: [],
    currentTurnName: '',

    // AI mode
    isAiMode: false,
    playerSymbol: 'X',
    aiSymbol: 'O',
    isPlayerTurn: true,
    difficulty: 'medium'  // 'easy' | 'medium' | 'hard'
  };
}
