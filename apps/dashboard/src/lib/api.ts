/**
 * Client HTTP per le API Beech.
 * - baseURL '/api': in dev il proxy Vite inoltra al Worker locale
 * - JWT: interceptor aggiunge Authorization Bearer
 * - FormData: interceptor rimuove Content-Type per far impostare il boundary al browser
 */
import axios, { type AxiosError } from 'axios';

/** Chiave localStorage per il JWT (deve coincidere con login-form) */
// TODO(security): access token in localStorage è un rischio XSS accettato.
// Valutare in futuro una strategia cookie-only (httpOnly) o token binding,
// mantenendo però la compatibilità con l'architettura attuale della dashboard.
export const AUTH_TOKEN_KEY = 'beech_token';

/** Path della pagina di login (evita redirect loop su 401) */
export const LOGIN_PATH = '/login';

/** Risposta POST /auth/login */
export interface LoginResponse {
  token: string
  expiresIn: string
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Cookie refresh_token (httpOnly)
});

// Interceptor: Prima di ogni richiesta, attacca il token se esiste
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  // FormData: rimuovi Content-Type per far impostare al browser multipart/form-data con boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
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

/** Decodifica il JWT e restituisce email e nome dal payload */
export function getStoredUser(): { email: string; name?: string } | null {
  if (typeof window === "undefined") return null
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return {
      email: payload.email ?? "",
      name: payload.name ?? "Admin",
    }
  } catch {
    return null
  }
}

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
