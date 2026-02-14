/**
 * Botanical Engine: tipi per Seed, Branch e payload.
 * Definisce la struttura dati usata dal Translation Layer.
 *
 * @see {@link ./engine} per le funzioni apiToDb e dbToApi
 * @see {@link ./seeds} per SEED_REGISTRY e getSeed
 */

/** Tipi di campo supportati dal Botanical Engine */
export type BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date'

/** Branch: definizione di una proprietà. id immutabile, alias mutabile. */
export interface Branch {
  /** ID immutabile, usato come chiave nel JSON salvato su D1 (es. br_01, br_x82) */
  id: string
  /** Alias mutabile, usato nel payload API (Frontend) */
  alias: string
  /** Etichetta per la UI (es. "Titolo Progetto") */
  label: string
  /** Tipo del valore */
  type: BranchType
}

/** Seed: definizione dello schema di un tipo di contenuto */
export interface Seed {
  /** Slug identificativo (es. 'progetti', 'blog') */
  slug: string
  /** Etichetta per la UI */
  label: string
  /** Lista dei campi (Branch) */
  branches: Branch[]
}

/** Payload salvato nel DB: chiavi = ID interni (br_xxx) */
export type DbPayload = Record<string, unknown>

/** Payload esposto alle API: chiavi = alias */
export type ApiPayload = Record<string, unknown>

/** Alias per il body della richiesta API */
export type ContentPayload = ApiPayload
