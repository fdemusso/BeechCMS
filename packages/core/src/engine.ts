/**
 * Botanical Engine: Schema Compiler + Query Builder.
 *
 * In v0.4.0 ogni Seed ha una tabella SQL dedicata (`content_{slug}`) con colonne
 * reali tipizzate. Questo modulo genera il DDL e costruisce query parametrizzate.
 * Non conosce HTTP, auth o UI — è una libreria Node.js pura (C6).
 */
import type {
  Seed,
  Branch,
  BranchType,
  FilterGroup,
  FilterType,
  FilterCondition,
  SelectOptions,
  ParameterizedQuery,
} from './types.js'

// ---- SQL type mapping ----

interface BranchSqlDef {
  sqlType: 'TEXT' | 'REAL' | 'INTEGER'
}

const BRANCH_TYPE_SQL: Record<BranchType, BranchSqlDef> = {
  text:     { sqlType: 'TEXT'    },
  number:   { sqlType: 'REAL'    },
  boolean:  { sqlType: 'INTEGER' },
  date:     { sqlType: 'INTEGER' },  // Unix timestamp (seconds)
  json:     { sqlType: 'TEXT'    },  // JSON serializzato
  richtext: { sqlType: 'TEXT'    },
  file:     { sqlType: 'TEXT'    },  // URL singolo o JSON array di URL
}

const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

// ---- Private helpers ----

function tableName(seed: Seed): string {
  return `content_${seed.slug}`
}

function ftsTableName(seed: Seed): string {
  return `fts_${seed.slug}`
}

function isValidColumn(seed: Seed, col: string): boolean {
  if (SYSTEM_COLUMNS.has(col)) return true
  return seed.branches.some(b => b.alias === col)
}

function indexableSearchBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b =>
    (b.type === 'text' || b.type === 'richtext') && b.policies?.search !== false
  )
}

function isAssetListBranch(branch: Branch): boolean {
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

function parseJsonSafe(value: string): unknown {
  try { return JSON.parse(value) } catch { return value }
}

function normalizeAssetListValue(rawValue: unknown): string[] {
  const input = typeof rawValue === 'string' ? parseJsonSafe(rawValue) : rawValue
  const values = Array.isArray(input) ? input : [input]
  const normalized: string[] = []
  for (const item of values) {
    if (item == null) continue
    const direct = normalizeHttpUrl(item)
    if (direct) { normalized.push(direct); continue }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const fromObj = normalizeHttpUrl((item as Record<string, unknown>).url)
      if (fromObj) normalized.push(fromObj)
    }
  }
  return [...new Set(normalized)]
}

// ---- DDL Generators ----

/**
 * Genera `CREATE TABLE IF NOT EXISTS content_{slug}` con colonne di sistema
 * + una colonna per ogni Branch. Funzione pura: stesso Seed → stesso SQL.
 */
export function generateCreateTable(seed: Seed): string {
  const table = tableName(seed)
  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  id         TEXT    NOT NULL PRIMARY KEY,`,
    `  slug       TEXT    NOT NULL UNIQUE,`,
    `  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),`,
  ]

  for (const branch of seed.branches) {
    const { sqlType } = BRANCH_TYPE_SQL[branch.type]
    let col = `  ${branch.alias}  ${sqlType}`
    if (branch.requiredOnCreate) col += ' NOT NULL'
    if (branch.type === 'boolean') col += ` CHECK (${branch.alias} IN (0, 1))`
    lines.push(col + ',')
  }

  lines.push(`  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`)
  lines.push(`  updated_at INTEGER NOT NULL DEFAULT (unixepoch())`)
  lines.push(`);`)

  return lines.join('\n')
}

/**
 * Genera la tabella bozze `content_{slug}_drafts` per i Seed con `allowDrafts: true`.
 * Tutte le colonne branch sono nullable (le bozze sono parziali).
 * Ritorna null se il Seed non ha `allowDrafts: true`.
 */
export function generateDraftTable(seed: Seed): string | null {
  if (!seed.allowDrafts) return null

  const table = `content_${seed.slug}_drafts`
  const mainTable = `content_${seed.slug}`
  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  entry_id  TEXT NOT NULL PRIMARY KEY`,
    `            REFERENCES ${mainTable}(id) ON DELETE CASCADE,`,
  ]

  for (const branch of seed.branches) {
    const { sqlType } = BRANCH_TYPE_SQL[branch.type]
    let col = `  ${branch.alias}  ${sqlType}`
    // boolean CHECK: in SQLite, NULL IN (0,1) → NULL, che passa il CHECK (solo FALSE lo fallisce)
    if (branch.type === 'boolean') col += ` CHECK (${branch.alias} IN (0, 1))`
    lines.push(col + ',')
  }

  lines.push(`  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())`)
  lines.push(`);`)

  return lines.join('\n')
}

/**
 * Genera `ALTER TABLE content_{slug} ADD COLUMN {alias} {type}`.
 * Nuove colonne sono sempre nullable (limite SQLite su ALTER TABLE).
 */
export function generateAddColumn(seed: Seed, branch: Branch): string {
  const { sqlType } = BRANCH_TYPE_SQL[branch.type]
  return `ALTER TABLE ${tableName(seed)} ADD COLUMN ${branch.alias} ${sqlType};`
}

/**
 * Genera indici B-tree per status, created_at e ogni Branch filtrabile
 * con tipo indicizzabile (text, number, date, boolean).
 */
export function generateIndexes(seed: Seed): string[] {
  const table = tableName(seed)
  const slug = seed.slug
  const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_${slug}_status ON ${table}(status);`,
    `CREATE INDEX IF NOT EXISTS idx_${slug}_created_at ON ${table}(created_at);`,
  ]

  for (const branch of seed.branches) {
    if (branch.policies?.filter === false) continue
    if (['text', 'number', 'date', 'boolean'].includes(branch.type)) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${slug}_${branch.alias} ON ${table}(${branch.alias});`
      )
    }
  }

  return indexes
}

/**
 * Genera la virtual table FTS5 per i Branch text/richtext indicizzabili.
 * Ritorna null se il Seed non ha branch con search abilitato.
 */
export function generateFtsTable(seed: Seed): string | null {
  const rtBranches = indexableSearchBranches(seed)
  if (rtBranches.length === 0) return null

  const ftsTable = ftsTableName(seed)
  const cols = rtBranches.map(b => `  ${b.alias}`).join(',\n')

  return [
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable} USING fts5(`,
    `  entry_id UNINDEXED,`,
    `${cols},`,
    `  tokenize = 'unicode61'`,
    `);`,
  ].join('\n')
}

/**
 * Genera i 3 trigger SQLite (insert/update/delete) che mantengono la FTS
 * sincronizzata automaticamente — elimina la necessità di syncFts manuale.
 * Ritorna array vuoto se il Seed non ha branch indicizzabili.
 */
export function generateFtsTriggers(seed: Seed): string[] {
  const rtBranches = indexableSearchBranches(seed)
  if (rtBranches.length === 0) return []

  const table = tableName(seed)
  const ftsTable = ftsTableName(seed)
  const slug = seed.slug
  const cols = rtBranches.map(b => b.alias)
  const ftsColList = ['entry_id', ...cols].join(', ')
  const newValList = ['new.id', ...cols.map(c => `new.${c}`)].join(', ')

  return [
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_insert`,
      `AFTER INSERT ON ${table} BEGIN`,
      `  INSERT INTO ${ftsTable}(${ftsColList}) VALUES (${newValList});`,
      `END;`,
    ].join('\n'),
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_update`,
      `AFTER UPDATE OF ${cols.join(', ')} ON ${table} BEGIN`,
      `  DELETE FROM ${ftsTable} WHERE entry_id = old.id;`,
      `  INSERT INTO ${ftsTable}(${ftsColList}) VALUES (${newValList});`,
      `END;`,
    ].join('\n'),
    [
      `CREATE TRIGGER IF NOT EXISTS fts_${slug}_delete`,
      `AFTER DELETE ON ${table} BEGIN`,
      `  DELETE FROM ${ftsTable} WHERE entry_id = old.id;`,
      `END;`,
    ].join('\n'),
  ]
}

// ---- Query Builder ----

/**
 * Costruisce una SELECT parametrizzata su `content_{slug}`.
 * Non usa mai json_extract — ogni colonna è una colonna reale.
 * Colonne sconosciute nei filtri/orderBy vengono ignorate (fail-closed).
 */
export function buildSelectQuery(seed: Seed, options: SelectOptions = {}): ParameterizedQuery {
  const table = tableName(seed)
  const { filters = [], orderBy, pagination, status, search, fields } = options
  const bindings: (string | number | boolean | null)[] = []
  const whereClauses: string[] = []
  let joinClause = ''

  // FTS JOIN — solo se il seed ha branch indicizzabili
  const rtBranches = indexableSearchBranches(seed)
  if (search && rtBranches.length > 0) {
    const ftsTable = ftsTableName(seed)
    joinClause = `INNER JOIN ${ftsTable} ON ${ftsTable}.entry_id = ${table}.id`
    whereClauses.push(`${ftsTable} MATCH ?`)
    // FTS5: prefix match con quote per caratteri speciali
    bindings.push(`"${search.replace(/"/g, '""')}"*`)
  }

  // Filtro status
  if (status !== undefined && status !== null) {
    whereClauses.push(`${table}.status = ?`)
    bindings.push(status)
  }

  // Filtri utente
  for (const group of filters) {
    if (!isValidColumn(seed, group.column)) continue
    const col = SYSTEM_COLUMNS.has(group.column)
      ? `${table}.${group.column}`
      : group.column

    for (const cond of group.conditions) {
      const clause = buildFilterCondition(col, group.type, cond, bindings)
      if (clause) whereClauses.push(clause)
    }
  }

  // Proiezione colonne
  let selectCols = `${table}.*`
  if (fields && fields.length > 0) {
    const valid = fields.filter(f => isValidColumn(seed, f))
    if (valid.length > 0) {
      selectCols = valid
        .map(f => (SYSTEM_COLUMNS.has(f) ? `${table}.${f}` : f))
        .join(', ')
    }
  }

  let sql = `SELECT ${selectCols} FROM ${table}`
  if (joinClause) sql += ` ${joinClause}`
  if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`

  // ORDER BY
  if (orderBy && isValidColumn(seed, orderBy.column)) {
    const dir = orderBy.dir === 'DESC' ? 'DESC' : 'ASC'
    const col = SYSTEM_COLUMNS.has(orderBy.column)
      ? `${table}.${orderBy.column}`
      : orderBy.column
    sql += ` ORDER BY ${col} ${dir}`
  } else {
    sql += ` ORDER BY ${table}.created_at DESC`
  }

  // Paginazione
  if (pagination) {
    sql += ` LIMIT ? OFFSET ?`
    bindings.push(pagination.limit, pagination.offset)
  }

  return { sql, bindings }
}

function buildFilterCondition(
  col: string,
  type: FilterType,
  cond: FilterCondition,
  bindings: (string | number | boolean | null)[]
): string | null {
  const { op, value } = cond

  if (op === 'is_empty') {
    return type === 'text' ? `(${col} IS NULL OR ${col} = '')` : `${col} IS NULL`
  }
  if (op === 'is_not_empty') {
    return type === 'text' ? `(${col} IS NOT NULL AND ${col} != '')` : `${col} IS NOT NULL`
  }
  if (value === null || value === undefined) return null

  if (op === 'eq') {
    bindings.push(type === 'boolean' ? (value ? 1 : 0) : (value as string | number))
    return `${col} = ?`
  }
  if (op === 'contains') {
    if (type === 'tags') {
      bindings.push(String(value))
      return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`
    }
    bindings.push(`%${String(value)}%`)
    return `${col} LIKE ?`
  }

  const mathOps: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' }
  if (mathOps[op]) {
    bindings.push(value as number)
    return `${col} ${mathOps[op]} ?`
  }

  return null
}

// ---- Schema introspection ----

export interface SchemaColumn {
  name: string
  sqlType: 'TEXT' | 'REAL' | 'INTEGER'
  notNull: boolean
  isPk: boolean
}

/**
 * Ritorna la lista di colonne attese per la tabella di un Seed.
 * Usato da `beech seed:load --diff` per confrontare schema attuale vs atteso.
 */
export function getExpectedColumns(seed: Seed): SchemaColumn[] {
  return [
    { name: 'id',         sqlType: 'TEXT',    notNull: true,  isPk: true  },
    { name: 'slug',       sqlType: 'TEXT',    notNull: true,  isPk: false },
    { name: 'status',     sqlType: 'TEXT',    notNull: true,  isPk: false },
    ...seed.branches.map(b => ({
      name:    b.alias,
      sqlType: BRANCH_TYPE_SQL[b.type].sqlType,
      notNull: b.requiredOnCreate ?? false,
      isPk:    false,
    })),
    { name: 'created_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
    { name: 'updated_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
  ]
}

// ---- Serialization / Deserialization ----

/**
 * Serializza un valore per la scrittura nel DB.
 * boolean → 0/1 | date → Unix timestamp | json/asset-list → JSON string
 */
export function serializeForDb(branch: Branch, value: unknown): string | number | null {
  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value ? 1 : 0

    case 'json':
    case 'richtext':
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'date': {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const d = new Date(value)
        if (isNaN(d.getTime())) return null
        if (branch.format === 'date') {
          const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
          return Math.floor(midnight / 1000)
        }
        return Math.floor(d.getTime() / 1000)
      }
      return null
    }

    case 'file':
      if (isAssetListBranch(branch)) {
        return Array.isArray(value) ? JSON.stringify(value) : typeof value === 'string' ? value : null
      }
      return typeof value === 'string' ? value : null

    default:
      return typeof value === 'string' ? value : typeof value === 'number' ? value : null
  }
}

/**
 * Deserializza un valore letto dal DB per la risposta API.
 * 0/1 → boolean | Unix timestamp → ISO 8601 | JSON string → object
 */
export function deserializeFromDb(branch: Branch, value: unknown): unknown {
  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value === 1 || value === true

    case 'json':
    case 'richtext': {
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return value }
      }
      return value
    }

    case 'date': {
      if (typeof value !== 'number') return null
      const d = new Date(value * 1000)
      return branch.format === 'date' ? d.toISOString().slice(0, 10) : d.toISOString()
    }

    case 'file':
      if (isAssetListBranch(branch)) return normalizeAssetListValue(value)
      return typeof value === 'string' ? value : null

    default:
      return value
  }
}
