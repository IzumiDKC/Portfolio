export const ROWS = 10;
export const COLS = 9;
export const PLAYER_TIME = 300; // 5 minutes

export const SOCKET_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';

// Piece display: [Vietnamese, English, Unicode symbol]
export const PIECE_LABELS = {
  r: { K: '帥', A: '仕', E: '相', R: '車', C: '炮', N: '馬', P: '兵' },
  b: { K: '將', A: '士', E: '象', R: '車', C: '砲', N: '馬', P: '卒' }
};

export const PIECE_NAMES_VI = {
  K: 'Tướng', A: 'Sĩ', E: 'Tượng', R: 'Xe', C: 'Pháo', N: 'Mã', P: 'Tốt'
};
export const PIECE_NAMES_EN = {
  K: 'King', A: 'Advisor', E: 'Elephant', R: 'Rook', C: 'Cannon', N: 'Knight', P: 'Pawn'
};
