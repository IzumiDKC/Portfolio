export const BOARD_SIZE = 9;
export const TURN_DURATION = 20; // seconds
export const SOCKET_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';
