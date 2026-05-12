import axios from 'axios';

const rawBase = import.meta.env.VITE_API_BASE;
const API_BASE = (typeof rawBase === 'string' && rawBase.trim()
  ? rawBase.trim().replace(/\/$/, '')
  : 'http://localhost:8000');

const api = axios.create({ baseURL: API_BASE });

// Auto-attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 — nhưng BỎ QUA route /auth/login và /auth/register
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register');
    if (err.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
