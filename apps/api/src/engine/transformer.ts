/**
 * Botanical Engine: Translation Layer.
 * Funzioni pure per convertire payload API (alias) <-> payload DB (br_xxx).
 */
import type { Seed, DbPayload, ApiPayload } from './types'

/**
 * Trasforma il payload API (chiavi = alias) in payload DB (chiavi = br_xxx).
 * Gli alias non riconosciuti vengono ignorati (policy safe).
 *
 * TODO (Sprint Validazione Zod): attualmente gli alias sconosciuti vengono ignorati
 * senza avviso. Se il Frontend invia "titlo" invece di "title", il dato viene
 * silenziosamente scartato. Aggiungere validazione campi obbligatori e
 * opzionale warning per alias non riconosciuti (typo detection).
 */
export function apiToDb(seed: Seed, payload: Record<string, unknown>): DbPayload {
  const result: DbPayload = {}

  for (const [alias, value] of Object.entries(payload)) {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (branch) {
      result[branch.id] = value
    }
    // Alias non trovato: ignorare (policy safe)
  }

  return result
}

/**
 * Trasforma il payload DB (chiavi = br_xxx) in payload API (chiavi = alias).
 * Chiavi nel DB non presenti nel Seed vengono ignorate.
 */
export function dbToApi(seed: Seed, data: Record<string, unknown> | null | undefined): ApiPayload {
  if (!data || typeof data !== 'object') {
    return {}
  }

  const result: ApiPayload = {}

  for (const branch of seed.branches) {
    if (branch.id in data) {
      result[branch.alias] = data[branch.id]
    }
  }

  return result
}
