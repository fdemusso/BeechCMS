/**
 * Client HTTP per le API Beech.
 * - baseURL '/api': in dev il proxy Vite inoltra al Worker locale
 * - JWT: interceptor aggiunge Authorization Bearer
 * - FormData: interceptor rimuove Content-Type per far impostare il boundary al browser
 */
import axios, { type AxiosError } from 'axios';

export const LOGIN_PATH = '/login';

/** Risposta POST /auth/login */
export interface LoginResponse {
  token: string
  expiresIn: string
}

// In-memory access token — never touches localStorage
let _accessToken: string | null = null;

export function getAccessToken(): string | null { return _accessToken }
export function setAccessToken(token: string): void { _accessToken = token }
export function clearAccessToken(): void { _accessToken = null }

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void): void {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string): void {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const requestUrl = originalRequest?.url || '';
      const isLoginRequest = requestUrl.includes('/auth/login');
      const isRefreshRequest = requestUrl.includes('/auth/refresh');

      if (isLoginRequest || isRefreshRequest) {
        return Promise.reject(error);
      }

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
        const { data } = await axios.post<LoginResponse>('/auth/refresh', {}, {
          withCredentials: true,
        });

        const newToken = data.token;
        setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        onRefreshed(newToken);
        isRefreshing = false;

        return axios(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        clearAccessToken();
        if (!window.location.pathname.startsWith(LOGIN_PATH)) {
          window.location.replace(LOGIN_PATH);
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

/** Rimuove il token, invalida refresh token nel backend e reindirizza alla pagina di login */
export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await axios.post('/auth/logout', {}, { withCredentials: true });
    } catch (err) {
      console.error('Logout error:', err);
    }

    clearAccessToken();
    window.location.replace(LOGIN_PATH);
  }
}
