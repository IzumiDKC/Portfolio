export const BOARD_SIZE = 42;
export const TURN_TIME_SEC = 15;
export const SOCKET_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';
