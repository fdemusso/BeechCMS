/**
 * Botanical Engine: tipi per Seed, Branch e payload.
 * Definisce la struttura dati usata dal Translation Layer.
 *
 * @see {@link ./engine} per le funzioni apiToDb e dbToApi
 * @see {@link ./seeds} per SEED_REGISTRY e getSeed
 */

/**
 * Tipi di campo supportati dal Botanical Engine.
 * - file: stringa URL (upload R2), vedi docs/media-engine.md
 */
export type BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date' | 'richtext' | 'file'

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
  /**
   * Variante semantica opzionale del campo per UI/validazione.
   * Esempio: `asset-list` su `file` multiplo.
   */
  format?: 'plain' | 'markdown' | 'html' | 'date' | 'datetime' | 'asset-list'
  /**
   * Cardinalità opzionale per campi media:
   * - false/undefined: singolo asset (string URL)
   * - true: lista asset (string[] URL)
   */
  multiple?: boolean
  /**
   * Vocabolario predefinito per campi tag/select/multiselect.
   * Lista statica definita nel Seed (non salvata nel DB, non richiede migrazioni).
   * Usata come suggerimenti in fase di creazione (FieldEdit) e come opzioni
   * nel dropdown dei filtri in ContentToolbar.
   */
  options?: string[]
}

/** Seed: definizione dello schema di un tipo di contenuto */
export interface Seed {
  /** Slug identificativo (es. 'progetti', 'blog') */
  slug: string
  /** Etichetta singolare per la UI (es. "Progetto", "Articolo Blog") */
  label: string
  /** Etichetta plurale per la UI (es. "Progetti", "Articoli Blog"). Se assente si usa `label`. */
  labelPlural?: string
  /** Abilita lettura dalla Public API (`GET /api/v1/public/:seed`). Default: false */
  allowPublicRead?: boolean
  /** Abilita creazione dalla Public API (`POST /api/v1/public/:seed/add`). Default: false */
  allowPublicPost?: boolean
  /** Abilita modifica dalla Public API (`PUT /api/v1/public/:seed/edit/:id`). Default: false */
  allowPublicEdit?: boolean
  /** Lista dei campi (Branch) */
  branches: Branch[]
}

/** Payload salvato nel DB: chiavi = ID interni (br_xxx) */
export type DbPayload = Record<string, unknown>

/** Payload esposto alle API: chiavi = alias */
export type ApiPayload = Record<string, unknown>

/** Alias per il body della richiesta API */
export type ContentPayload = ApiPayload
