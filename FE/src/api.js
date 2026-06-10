import axios from 'axios';

const rawBase = import.meta.env.VITE_API_BASE;
export const API_BASE = (typeof rawBase === 'string' && rawBase.trim()
  ? rawBase.trim().replace(/\/$/, '')
  : 'http://127.0.0.1:8000');

const api = axios.create({ baseURL: API_BASE });

export function toWebSocketUrl(path) {
  const absoluteBase = new URL(API_BASE, window.location.origin);
  const url = new URL(path, absoluteBase);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

// Auto-attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const hasAuthHeader = config.headers?.Authorization || config.headers?.authorization;
  if (token && !hasAuthHeader) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 — nhưng BỎ QUA route /auth/login và /auth/register
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/google');
    if (err.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
