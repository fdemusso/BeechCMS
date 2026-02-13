/** Messaggi di errore API auth - usati da handler e test */
export const AUTH_ERRORS = {
  INVALID_REQUEST: 'Invalid request',
  INVALID_CREDENTIALS: 'Invalid credentials',
  DATABASE_ERROR: 'Database error',
  /** Messaggio generico per errori 500 - non rivela dettagli del sistema */
  GENERIC_ERROR: 'An error occurred',
  /** Rate limit superato */
  RATE_LIMIT_EXCEEDED: 'Too many requests',
} as const
