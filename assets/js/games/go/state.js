import { BOARD_SIZE } from './constants.js';

export function createGoState() {
  return {
    socket: null,
    myPlayerName: '',
    currentRoomCode: null,
    isHost: false,
    onlinePlayers: [],
    isGameOver: false,
    board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
    myColor: null,         // 'B' or 'W'
    currentTurnName: '',
    captures: { black: 0, white: 0 },
    consecutivePasses: 0,
    timeLeft: 20
  };
}
