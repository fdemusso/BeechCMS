// apps/dashboard/src/lib/api.ts
import axios, { type AxiosError } from 'axios';

/** Chiave usata per salvare il JWT in localStorage. Usa la stessa chiave in login-form. */
export const AUTH_TOKEN_KEY = 'beech_token';

/** Path della pagina di login (per evitare redirect loop) */
export const LOGIN_PATH = '/login';

/** Risposta API POST /auth/login (auth.md) */
export interface LoginResponse {
  token: string
  expiresIn: string
}

// Grazie al proxy in vite.config.ts, '/api' viene girato al worker locale
export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Necessario per inviare httpOnly cookies al backend
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

// Stato refresh token per evitare chiamate multiple parallele
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void): void {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string): void {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

// Interceptor: Se riceviamo 401 (Token scaduto), prova refresh automatico
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const requestUrl = originalRequest?.url || '';
      const isLoginRequest = requestUrl.includes('/auth/login');
      const isRefreshRequest = requestUrl.includes('/auth/refresh');

      // Non fare refresh per login e refresh stesso - lascia gestire al componente
      if (isLoginRequest || isRefreshRequest) {
        return Promise.reject(error);
      }

      // Se già stiamo refreshando, accoda la richiesta
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(axios(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Chiama /auth/refresh (refresh_token viene inviato automaticamente come cookie)
        const { data } = await axios.post<LoginResponse>('/auth/refresh', {}, {
          withCredentials: true,
        });

        const newToken = data.token;

        // Salva nuovo access token
        localStorage.setItem(AUTH_TOKEN_KEY, newToken);

        // Aggiorna header della richiesta originale
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        // Notifica le richieste in coda
        onRefreshed(newToken);

        isRefreshing = false;

        // Riprova la richiesta originale
        return axios(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;

        // Refresh fallito: logout e redirect
        localStorage.removeItem(AUTH_TOKEN_KEY);
        if (!window.location.pathname.startsWith(LOGIN_PATH)) {
          window.location.replace(LOGIN_PATH);
        }

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/** Rimuove il token, invalida refresh token nel backend e reindirizza alla pagina di login */
export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      // Chiama backend per invalidare refresh token (cookie inviato automaticamente)
      await axios.post('/auth/logout', {}, { withCredentials: true });
    } catch (err) {
      console.error('Logout error:', err);
      // Continua comunque con logout locale
    }

    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.replace(LOGIN_PATH);
  }
}
