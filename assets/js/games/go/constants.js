export const BOARD_SIZE = 9;
export const PLAYER_TIME = 180; // 3 minutes per player
export const SOCKET_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';
