// apps/dashboard/src/lib/api.ts
import axios, { type AxiosError } from 'axios';

/** Chiave usata per salvare il JWT in localStorage. Usa la stessa chiave in login-form. */
export const AUTH_TOKEN_KEY = 'beech_token';

/** Path della pagina di login (per evitare redirect loop) */
const LOGIN_PATH = '/login';

// Grazie al proxy in vite.config.ts, '/api' viene girato al worker locale
export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor: Prima di ogni richiesta, attacca il token se esiste
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor: Se riceviamo 401 (Token scaduto), logout e redirect
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      // replace() evita che il back button riporti alla pagina con errore
      if (!window.location.pathname.startsWith(LOGIN_PATH)) {
        window.location.replace(LOGIN_PATH);
      }
    }
    return Promise.reject(error);
  }
);
