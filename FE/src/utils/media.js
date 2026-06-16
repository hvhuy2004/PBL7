export function resolveMediaUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${window.location.origin}${url}`;
  }

  return url;
}

export function isSupportedAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return true;
  return /^https?:\/\//i.test(url) || url.startsWith('/');
}
