// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FileAccept } from './file-types.js'

export type BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date' | 'richtext' | 'file' | 'tags' | 'relation'

/** Configurazioni specializzate per il tipo di branch 'number' */
export interface NumberFieldOptions {
  // ---- Presentazione & Formattazione ----
  /** Stile di presentazione visiva. Default: 'decimal' */
  format?: 'decimal' | 'currency' | 'percentage' | 'compact'
  /** Codice valuta ISO 4217 (obbligatorio se format === 'currency'). Es. 'EUR', 'USD' */
  currency?: string
  /** Testo personalizzato da anteporre al valore formattato */
  prefix?: string
  /** Unità di misura personalizzata da appendere al valore formattato (es. 'kg', 'm²') */
  suffix?: string
  /** Numero esplicito di cifre decimali da visualizzare e imporre */
  decimals?: number
  /** Abilita/disabilita il separatore delle migliaia. Default: true */
  grouping?: boolean

  // ---- Controlli UI dell'Editor ----
  /** Meccanismo di input alternativo per l'editor delle entità. Default: 'input' */
  control?: 'input' | 'slider' | 'rating' | 'stepper'

  // ---- Vincoli & Validazione ----
  /** Valore minimo consentito */
  min?: number
  /** Valore massimo consentito */
  max?: number
  /** Incremento del valore (es. 1 per interi stretti, 0.5 per mezzi passi) */
  step?: number
}

/** Configurazioni specializzate per il tipo di branch 'file' */
export interface FileFieldOptions {
  /**
   * Tipo semantico di file accettato.
   * - 'image': immagini renderizzabili come anteprima
   * - 'document': PDF/Office/text
   * - 'any': qualsiasi file (default — UI mostra icona generica, nessun tentativo di render immagine)
   * Default: 'any'.
   */
  accept?: FileAccept
  /**
   * Dimensione massima del singolo file in byte.
   * NOTA: il backend /upload applica MAX_FILE_SIZE_BYTES (5MB) globale —
   * questo campo è informativo per la UI; non viene enforced in upload.
   * Default: 5_242_880.
   */
  maxSize?: number
}

/** Branch: definizione di una proprietà. alias = nome colonna SQL. */
export interface Branch {
  /** Alias human-readable, usato nel payload API e come nome colonna SQL nella tabella dedicata */
  alias: string
  /** Etichetta per la UI */
  label: string
  /** Tipo del valore */
  type: BranchType
  /**
   * Variante semantica opzionale del campo per UI/validazione.
   * `asset-list` su `file` multiplo abilita la gestione galleria.
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
   * Lista statica definita nel Seed (non salvata nel DB).
   */
  options?: string[]
  /** Campo obbligatorio in creazione — genera NOT NULL in generateCreateTable */
  requiredOnCreate?: boolean
  /** Campo obbligatorio in update */
  requiredOnUpdate?: boolean
  /**
   * Policy di accesso e trattamento del campo.
   * Tutti i valori sono opzionali — `resolvePolicies(branch)` fornisce i default.
   */
  policies?: {
    /** Come il valore viene memorizzato. Default: 'plain' */
    privacy?: 'plain' | 'hash' | 'encrypt'
    /** Come il valore viene restituito nelle risposte API. Default: 'full' */
    visibility?: 'full' | 'masked' | 'hidden'
    /** Il campo è incluso nelle query di ricerca full-text. Default: true */
    search?: boolean
    /** Il campo è disponibile come colonna di filtro nella dashboard. Default: true */
    filter?: boolean
    /** Il campo è disponibile come colonna di ordinamento nella dashboard. Default: true */
    sort?: boolean
    /** Il campo è incluso nelle risposte della Public API. Default: true */
    public?: boolean
  }
  /** Opzioni avanzate per i campi numerici. Ignorato se type !== 'number' */
  numberOptions?: NumberFieldOptions
  /** Opzioni avanzate per i campi file. Ignorato se type !== 'file' */
  fileOptions?: FileFieldOptions

  /**
   * Slug of the referenced Seed (without the `content_` prefix).
   * REQUIRED when `type === 'relation'`. Ignored otherwise.
   * Example: 'team' → references table `content_team(id)`.
   */
  targetSeed?: string

  /**
   * SQLite ON DELETE rule applied to the foreign-key constraint.
   * Defaults to 'SET NULL' when `type === 'relation'` and no value is provided.
   * - CASCADE  : delete dependent rows when the parent is deleted.
   * - SET NULL : null out the column when the parent is deleted (default).
   * - RESTRICT : block parent deletion while dependent rows exist.
   *
   * NOTE: When `multiple: true` (introduced in Sprint 5 for many-to-many), this
   * rule applies to the FK from the junction table to the target table.
   */
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
}

/** Dashboard-specific config embedded in a Seed. All fields optional — defaults applied by the dashboard. */
export interface DashboardSeedConfig {
  /** Lucide icon name (string, resolved to component client-side). Default: 'Folder' */
  icon?: string
  /** Sidebar group label. Ungrouped seeds share a single 'Contents' section. */
  group?: string
  /** Sort order within the group. Lower = higher. Default: 99 */
  order?: number
  /** Hide from sidebar navigation. Default: false */
  hidden?: boolean
  /** Tooltip description shown in the sidebar. */
  description?: string
  /** UI feature toggles. All default to true unless specified. */
  features?: {
    search?: boolean
    filter?: boolean
    export?: boolean
    bulkDelete?: boolean
  }
}

/** Seed: definizione dello schema di un tipo di contenuto */
export interface Seed {
  /** Slug identificativo — anche nome tabella: `content_{slug}` */
  slug: string
  /** Etichetta singolare per la UI */
  label: string
  /** Etichetta plurale per la UI. Se assente si usa `label`. */
  labelPlural?: string
  /** Abilita lettura dalla Public API (`GET /api/v1/public/:seed`). Default: false */
  allowPublicRead?: boolean
  /** Abilita creazione dalla Public API (`POST /api/v1/public/:seed/add`). Default: false */
  allowPublicPost?: boolean
  /** Abilita modifica dalla Public API (`PUT /api/v1/public/:seed/edit/:id`). Default: false */
  allowPublicEdit?: boolean
  /**
   * Abilita la feature "bozza in attesa" per questo seed.
   * Quando true, genera tabella `content_{slug}_drafts` e abilita gli endpoint `/draft`.
   * Default: false
   */
  allowDrafts?: boolean
  /**
   * Alias del branch usato come nome leggibile dell'entry (es. "title", "name", "author").
   * Obbligatorio — le UI lo usano per display senza euristica.
   */
  displayNameAlias: string
  /** Lista dei campi (Branch) */
  branches: Branch[]
  /** Optional dashboard-specific UI config. Ignored by the Botanical Engine. */
  dashboard?: DashboardSeedConfig
}

// ---- Query types (usati da buildSelectQuery nel Botanical Engine) ----

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'
  | 'has_tag'
  | 'has_any_tag'
  | 'has_all_tags'

export type FilterType = 'text' | 'number' | 'date' | 'boolean' | 'tags' | 'select' | 'system' | 'json'

export interface FilterCondition {
  op: FilterOperator
  value: string | number | boolean | null | string[] | number[]
}

export interface FilterGroup {
  /** Nome colonna: system column (id/slug/status/created_at/updated_at) o branch alias */
  column: string
  type: FilterType
  conditions: FilterCondition[]
}

export interface SelectOptions {
  filters?: FilterGroup[]
  orderBy?: { column: string; dir: 'ASC' | 'DESC' }
  pagination?: { limit: number; offset: number }
  /** Filtra per status. null = nessun filtro status. */
  status?: string | null
  /** Full-text search — usa FTS5 se il seed ha branch richtext indicizzabili */
  search?: string
  /** Proiezione colonne. Vuoto = SELECT * */
  fields?: string[]
}

export interface ParameterizedQuery {
  sql: string
  bindings: (string | number | boolean | null)[]
}
