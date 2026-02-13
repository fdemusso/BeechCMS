/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { jwtVerify } from 'jose'

/** Payload JWT decodificato (sub = userId, email opzionale) */
export type JwtPayload = {
  sub: string
  email?: string
}

/** Variabili iniettate nel context Hono dopo auth */
export type AuthVariables = {
  jwtPayload: JwtPayload
}

const UNAUTHORIZED_JSON = JSON.stringify({ error: 'Unauthorized' })

function unauthorizedResponse() {
  return new Response(UNAUTHORIZED_JSON, {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Middleware di autenticazione JWT.
 * Intercetta Authorization: Bearer <token>, verifica con jose e JWT_SECRET.
 * Se valido: imposta jwtPayload nel context e chiama next().
 * Se invalido/mancante: lancia HTTPException 401 (gestita dal framework).
 */
export function authMiddleware(secret: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    const token = auth.slice(7)
    if (!token) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    try {
      const secretBytes = new TextEncoder().encode(secret)
      const { payload } = await jwtVerify(token, secretBytes)
      c.set('jwtPayload', payload as JwtPayload)
      await next()
    } catch {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }
  }
}
