import { API_BASE } from '../api';

export function resolveMediaUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('/')) {
    const apiBaseUrl = new URL(API_BASE, window.location.origin);
    return `${apiBaseUrl.origin}${url}`;
  }

  return url;
}

export function isSupportedAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return true;
  return /^https?:\/\//i.test(url) || url.startsWith('/');
}
