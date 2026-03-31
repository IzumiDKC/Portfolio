export function createCaroState() {
  return {
    board: [],
    isGameOver: false,
    socket: null,
    currentRoomCode: null,
    myPlayerName: '',
    isHost: false,
    onlinePlayers: [],
    currentTurnName: ''
  };
}
