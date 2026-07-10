// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IHashProvider } from '@beechcms/core'

export type LoginCredentials = {
  email: string
  password: string
}

/** 
 * Regex per validare formato email.
 * Utilizza classi di caratteri che non si sovrappongono per evitare il backtracking catastrofico (ReDoS).
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
/** Lunghezza massima email secondo standard RFC 5321 */
const MAX_EMAIL_LENGTH = 254

/** Lunghezza minima password (caratteri) */
const MIN_PASSWORD_LENGTH = 8

/** Lunghezza massima password (caratteri) - limite ragionevole per evitare DoS */
const MAX_PASSWORD_LENGTH = 128

/** bcrypt hasha solo i primi 72 byte UTF-8; oltre viene ignorato silenziosamente */
const MAX_PASSWORD_BYTES = 72

/**
 * Hash bcrypt dummy valido.
 * Usato quando l'utente non esiste per evitare timing attack
 * (stesso tempo di risposta che con password errata).
 */
export const DUMMY_PASSWORD_HASH =
  '$2a$10$SbkRFOafACxVM2ahxerVDu3tSkCXWm29b62WdB.4WGG02Qjsfzni6'

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
  return { email: email.trim().toLowerCase(), password }
}

/**
 * Verifica che email e password rispettino i formati richiesti.
 * @param email - Email da validare (deve contenere @ e punto dopo @)
 * @param password - Password (8-128 caratteri)
 * @returns true se valido
 */
export function validateLoginInput(email: string, password: string): boolean {
  return (
    email.length <= MAX_EMAIL_LENGTH &&
    EMAIL_REGEX.test(email) &&
    password.trim().length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES
  )
}

/**
 * Verifica che la password in chiaro corrisponda all'hash salvato.
 * @param plainPassword - Password in chiaro
 * @param hash - Hash salvato nel DB
 * @param hashProvider - Provider usato per la comparazione costante-time
 * @returns true se la password è corretta
 */
export async function verifyPassword(
  plainPassword: string,
  hash: string,
  hashProvider: IHashProvider
): Promise<boolean> {
  return hashProvider.verify(plainPassword, hash)
}
