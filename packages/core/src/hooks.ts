// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ContentRepository } from './content.repository.js'
import type { Seed } from './types.js'

export interface HookActor {
  id: string
  role: string
  email?: string
}

export interface HookContext {
  seed: Seed
  /** Canale lecito per side-effect sui contenuti dagli hook (rispetta la Botanical Engine). */
  repository: ContentRepository
  /** Utente che esegue l'operazione, estratto dal JWT. Assente per operazioni di sistema/cron. */
  actor?: HookActor
  /**
   * Escape hatch per la connessione nativa (D1Database in prod, better-sqlite3 nei test).
   * Tipizzato `unknown` per non accoppiare @beechcms/core a Cloudflare. Usare con cautela:
   * scrivere qui bypassa la Botanical Engine.
   */
  db: unknown
}

export interface BeechHooks {
  // Eseguiti PRIMA della scrittura. Se lanciano un errore, la scrittura non parte.
  // Possono restituire una versione modificata del payload (alias-keyed) o void.
  beforeCreate?: (data: Record<string, any>, ctx: HookContext) => Promise<Record<string, any> | void> | Record<string, any> | void
  beforeUpdate?: (id: string, patches: Record<string, any>, ctx: HookContext) => Promise<Record<string, any> | void> | Record<string, any> | void
  beforeDelete?: (id: string, ctx: HookContext) => Promise<void> | void

  // Eseguiti DOPO la scrittura andata a buon fine. NON possono fare rollback su D1.
  afterCreate?: (entry: Record<string, any>, ctx: HookContext) => Promise<void> | void
  afterUpdate?: (entry: Record<string, any>, ctx: HookContext) => Promise<void> | void
  afterDelete?: (id: string, ctx: HookContext) => Promise<void> | void
}
