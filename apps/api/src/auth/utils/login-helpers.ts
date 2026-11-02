// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IHashProvider } from '@beechcms/core'

/**
 * Hash bcrypt dummy valido.
 * Usato quando l'utente non esiste per evitare timing attack
 * (stesso tempo di risposta che con password errata).
 */
export const DUMMY_PASSWORD_HASH =
  '$2a$10$SbkRFOafACxVM2ahxerVDu3tSkCXWm29b62WdB.4WGG02Qjsfzni6'

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
