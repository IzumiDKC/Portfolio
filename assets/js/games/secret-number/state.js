export function createGameState() {
  return {
    minRange: 0,
    maxRange: 1000,
    secretAmount: 0,
    mode: 'bot',
    totalPlayers: 2,
    currentPlayer: 1,
    isGameOver: false,
    afkTimer: null,
    offlinePenalties: {},
    socket: null,
    currentRoomCode: null,
    myPlayerName: '',
    isHost: false,
    onlinePlayers: [],
    myTurnIndex: -1,
    currentTurnName: ''
  };
}
