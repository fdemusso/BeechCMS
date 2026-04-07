/**
 * Error constants for Public API responses.
 */
export const PUBLIC_ERRORS = {
  API_KEY_UNAUTHORIZED: {
    error: 'Unauthorized',
    message:
      'Missing or invalid API key. Provide a valid key via X-API-Key header or ?key= query parameter.',
  },
  API_KEY_FORBIDDEN: {
    error: 'Forbidden',
    message: 'Public API access is not configured for this instance.',
  },
} as const

