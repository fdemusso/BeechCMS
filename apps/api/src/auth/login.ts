/// <reference types="@cloudflare/workers-types" />
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'

export type LoginCredentials = {
  email: string
  password: string
}

export type UserRecord = {
  id: string
  email: string
  password_hash: string
}

const EMAIL_REGEX = /^[^@]+@[^@]+$/

/**
 * Estrae e valida email e password dal body della richiesta.
 * @param body - Body grezzo (tipicamente da req.json())
 * @returns Oggetto {email, password} se valido, null altrimenti
 */
export function parseLoginBody(body: unknown): LoginCredentials | null {
  if (body === null || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  const email = obj.email
  const password = obj.password
  if (typeof email !== 'string' || typeof password !== 'string') return null
  if (!email.trim() || !password) return null
  return { email: email.trim(), password }
}

/**
 * Verifica che email e password rispettino i formati richiesti.
 * @param email - Email da validare (deve contenere @)
 * @param password - Password (deve essere non vuota)
 * @returns true se valido
 */
export function validateLoginInput(email: string, password: string): boolean {
  return EMAIL_REGEX.test(email) && password.length > 0
}

/**
 * Cerca un utente nel database D1 per email.
 * @param db - Istanza D1Database
 * @param email - Email dell'utente
 * @returns UserRecord se trovato, null altrimenti
 */
export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<UserRecord | null> {
  const stmt = db.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1'
  )
  const row = await stmt.bind(email).first<UserRecord>()
  return row
}

/**
 * Verifica che la password in chiaro corrisponda all'hash bcrypt salvato.
 * @param plainPassword - Password in chiaro
 * @param hash - Hash bcrypt salvato nel DB
 * @returns true se la password è corretta
 */
export async function verifyPassword(
  plainPassword: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash)
}

/**
 * Genera un JWT firmato con payload sub (userId) e email, scadenza 2 ore.
 * @param userId - ID utente (sub claim)
 * @param email - Email utente
 * @param secret - JWT_SECRET (stringa)
 * @returns Token JWT firmato
 */
export async function generateJwt(
  userId: string,
  email: string,
  secret: string
): Promise<string> {
  const secretBytes = new TextEncoder().encode(secret)
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secretBytes)
}
