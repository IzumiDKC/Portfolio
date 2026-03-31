export function createMemoryState() {
  return {
    isGameOver: false,
    socket: null,
    currentRoomCode: null,
    myPlayerName: '',
    isHost: false,
    onlinePlayers: [],
    currentTurnName: ''
  };
}
