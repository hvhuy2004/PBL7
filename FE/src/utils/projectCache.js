import api from '../api';

const CACHE_KEY = 'my-projects-cache-v1';
const CACHE_TTL_MS = 60 * 1000;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function readProjectsCache() {
  if (!canUseStorage()) return [];

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed?.items || !Array.isArray(parsed.items)) return [];
    if (!parsed.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

export function writeProjectsCache(items) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      items: Array.isArray(items) ? items : [],
      timestamp: Date.now(),
    }));
  } catch {
    // ignore cache write failures
  }
}

export async function fetchMyProjects({ preferCache = true } = {}) {
  const cached = readProjectsCache();
  if (preferCache && cached.length) {
    return { items: cached, fromCache: true };
  }

  const response = await api.get('/projects/me');
  const items = response.data || [];
  writeProjectsCache(items);
  return { items, fromCache: false };
}
