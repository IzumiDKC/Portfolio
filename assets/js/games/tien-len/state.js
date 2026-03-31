export function createTienLenState() {
  return {
    myId: null,
    roomCode: null,
    players: [],
    myHand: [],
    selectedCards: [],
    currentTurnId: null,
    isHost: false
  };
}
