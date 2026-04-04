// ml-storage.js – Persistence layer for Caro ML data via localStorage

const ML_STORAGE_VERSION = 2;
const ML_KEY = `caro_ml_data_v${ML_STORAGE_VERSION}`;

export function loadMLData() {
  try {
    const raw = localStorage.getItem(ML_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.warn('[ML] Failed to load ML data:', e);
    return {};
  }
}

export function saveMLData(data) {
  try {
    localStorage.setItem(ML_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage quota exceeded – prune Q-table and retry
    try {
      localStorage.removeItem(ML_KEY);
      localStorage.setItem(ML_KEY, JSON.stringify(data));
    } catch (e2) {
      console.error('[ML] Could not save ML data after pruning:', e2);
    }
  }
}

export function getGamesPlayed() {
  return loadMLData().gamesPlayed || 0;
}

export { ML_STORAGE_VERSION };
