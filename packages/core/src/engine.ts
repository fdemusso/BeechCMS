/**
 * Botanical Engine: Translation Layer.
 * Funzioni pure per convertire payload API (alias) <-> payload DB (br_xxx).
 */
import type { Seed, DbPayload, ApiPayload } from './types'

function isAssetListBranch(branch: Seed['branches'][number]): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned)
    return parsed.protocol.startsWith('http') ? cleaned : null
  } catch {
    return null
  }
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeAssetListValue(rawValue: unknown): string[] {
  const input = typeof rawValue === 'string' ? parseJsonString(rawValue) : rawValue
  const values = Array.isArray(input) ? input : [input]
  const normalized: string[] = []
  for (const item of values) {
    if (item == null) continue
    const direct = normalizeHttpUrl(item)
    if (direct) {
      normalized.push(direct)
      continue
    }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const fromObject = normalizeHttpUrl((item as Record<string, unknown>).url)
      if (fromObject) {
        normalized.push(fromObject)
      }
    }
  }
  return [...new Set(normalized)]
}

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

      // Asset list: normalizza vecchi formati in array di URL.
      if (isAssetListBranch(branch)) {
        value = normalizeAssetListValue(value)
      }
      
      result[branch.alias] = value
    }
  }

  return result
}
