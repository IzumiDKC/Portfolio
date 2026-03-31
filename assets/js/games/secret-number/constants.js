export const AFK_TIMEOUT_MS = 10000;
export const RANGE_STEP_LIMIT = 100;
export const SOCKET_URL = (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
  ? 'http://localhost:3001'
  : 'https://server.dienisme.online';

export function pickAutoGuess(minRange, maxRange) {
  if (maxRange - minRange <= 200) {
    return Math.floor(Math.random() * (maxRange - minRange - 1)) + minRange + 1;
  }

  const isLeft = Math.random() < 0.5;
  return isLeft
    ? minRange + 1 + Math.floor(Math.random() * RANGE_STEP_LIMIT)
    : maxRange - 1 - Math.floor(Math.random() * RANGE_STEP_LIMIT);
}
