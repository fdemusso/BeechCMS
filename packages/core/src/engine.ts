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
 *
 * TODO (Performance): le funzioni apiToDb e dbToApi hanno complessità O(N*M)
 * dove N è il numero di chiavi nel payload e M è il numero di rami (branch) nel Seed.
 * Per Seed con molti campi, ottimizzare pre-costruendo dei Map (aliasToId e idToAlias) 
 * all'interno dell'oggetto Seed o gestirli tramite una cache nel Botanical Engine.
 */
export function apiToDb(seed: Seed, payload: Record<string, unknown>): DbPayload {
  const result: DbPayload = {}

  for (const [alias, value] of Object.entries(payload)) {
    const branchDef = seed.branches.find((branch) => branch.alias === alias)
    if (branchDef) {
      result[branchDef.id] = value
    }
    // Alias non trovato: ignorare (policy safe)
  }

  return result
}

/**
 * Trasforma il payload DB (chiavi = br_xxx) in payload API (chiavi = alias).
 * Chiavi nel DB non presenti nel Seed vengono ignorate.
 * Per i campi di tipo 'json', fa il double-parse se il valore è una stringa JSON.
 */
export function dbToApi(seed: Seed, data: Record<string, unknown> | null | undefined): ApiPayload {
  if (!data || typeof data !== 'object') {
    return {}
  }

  const result: ApiPayload = {}

  for (const branch of seed.branches) {
    if (branch.id in data) {
      let value = data[branch.id]
      
      // Per campi JSON, tenta il double-parse se è una stringa
      if (branch.type === 'json' && typeof value === 'string') {
        try {
          value = JSON.parse(value)
        } catch {
          // Se fallisce, mantieni la stringa originale
        }
      }
      
      result[branch.alias] = value
    }
  }

  return result
}
