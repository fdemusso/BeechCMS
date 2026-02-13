/// <reference types="@cloudflare/workers-types" />
import { SignJWT } from 'jose'

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

/** Hash SHA-256 del refresh token per storage sicuro - usa Web Crypto API */
export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Salva refresh token in DB (hashed) */
export async function saveRefreshToken(
  db: D1Database,
  userId: string,
  token: string,
  expiresInDays: number = 7
): Promise<void> {
  const id = crypto.randomUUID()
  const tokenHash = await hashRefreshToken(token)
  const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60)
  
  await db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) 
     VALUES (?, ?, ?, ?)`
  ).bind(id, userId, tokenHash, expiresAt).run()
}

/** Valida refresh token: controlla hash in DB, scadenza, revoca */
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

/** Invalida (revoca) un refresh token */
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

/** Genera access token con scadenza breve (15 min) */
export async function generateAccessToken(
  userId: string,
  email: string,
  secret: string
): Promise<string> {
  const secretBytes = new TextEncoder().encode(secret)
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m') // 15 minuti invece di 2h
    .sign(secretBytes)
}
