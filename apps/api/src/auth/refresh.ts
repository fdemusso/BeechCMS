/// <reference types="@cloudflare/workers-types" />
import { SignJWT } from 'jose'

/** Secondi in un giorno (per calcolo scadenza) */
const SECONDS_PER_DAY = 24 * 60 * 60

export type RefreshTokenRecord = {
  id: string
  user_id: string
  token_hash: string
  expires_at: number
  created_at: number
  revoked_at: number | null
}

/** Genera un refresh token sicuro (UUID v4) - usa Web Crypto API globale */
export function generateRefreshToken(): string {
  return crypto.randomUUID()
}

/**
 * Hash SHA-256 del refresh token per storage sicuro.
 * Usa Web Crypto API (crypto.subtle.digest).
 */
export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashBytes = Array.from(new Uint8Array(hashBuffer))
  return hashBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Salva refresh token in DB (solo hash, mai in chiaro).
 * @param expiresInDays - Giorni di validità (default 7)
 */
export async function saveRefreshToken(
  db: D1Database,
  userId: string,
  token: string,
  expiresInDays: number = 7
): Promise<void> {
  const id = crypto.randomUUID()
  const tokenHash = await hashRefreshToken(token)
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * SECONDS_PER_DAY
  
  await db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) 
     VALUES (?, ?, ?, ?)`
  ).bind(id, userId, tokenHash, expiresAt).run()
}

/**
 * Valida refresh token: verifica hash in DB, scadenza e che non sia revocato.
 * @returns { valid, userId? } - userId presente solo se valido
 */
export async function validateRefreshToken(
  db: D1Database,
  token: string
): Promise<{ valid: boolean; userId?: string }> {
  const tokenHash = await hashRefreshToken(token)
  const now = Math.floor(Date.now() / 1000)
  
  const row = await db.prepare(
    `SELECT user_id, expires_at, revoked_at 
     FROM refresh_tokens 
     WHERE token_hash = ? LIMIT 1`
  ).bind(tokenHash).first<RefreshTokenRecord>()
  
  if (!row) return { valid: false }
  if (row.revoked_at !== null) return { valid: false }
  if (row.expires_at < now) return { valid: false }
  
  return { valid: true, userId: row.user_id }
}

/**
 * Revoca un refresh token impostando revoked_at.
 * Il token non potrà più essere usato per il refresh.
 */
export async function revokeRefreshToken(
  db: D1Database,
  token: string
): Promise<void> {
  const tokenHash = await hashRefreshToken(token)
  const now = Math.floor(Date.now() / 1000)
  
  await db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`
  ).bind(now, tokenHash).run()
}

/**
 * Genera JWT access token con scadenza breve (15 min).
 * Payload: sub (userId), email. Algoritmo HS256.
 */
export async function generateAccessToken(
  userId: string,
  email: string,
  secret: string
): Promise<string> {
  const secretBytes = new TextEncoder().encode(secret)
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretBytes)
}
