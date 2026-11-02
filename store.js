// localStorage wrapper. Data never leaves the device unless you export it.
import { migrate } from './logic.js';
import { DEFAULT_PRESETS } from './presets.js';

export const KEY = 'drinkTally.v1';

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { data: migrate(null, DEFAULT_PRESETS), firstRun: true, ok: false };
  }
  if (!raw) return { data: migrate(null, DEFAULT_PRESETS), firstRun: true, ok: true };
  try {
    return { data: migrate(JSON.parse(raw), DEFAULT_PRESETS), firstRun: false, ok: true };
  } catch {
    // Keep the unreadable copy so nothing is lost, then start clean.
    try {
      localStorage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
    } catch {}
    return { data: migrate(null, DEFAULT_PRESETS), firstRun: true, ok: false };
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
