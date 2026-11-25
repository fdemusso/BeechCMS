// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function validateDbName(name: string): string {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid D1 database name: ${name}`)
  }
  return name
}

export interface WranglerOptions {
  db: string
  local: boolean
  configPath: string | null
}

export interface D1Row {
  [key: string]: unknown
}

interface WranglerResult {
  results: D1Row[]
  success: boolean
  error?: string
}

function buildArgs(options: WranglerOptions): string[] {
  const args: string[] = []
  if (options.configPath) args.push('--config', options.configPath)
  if (options.local) args.push('--local')
  else args.push('--remote')
  return args
}

export function getLocalD1SqlitePath(startDir: string = process.cwd()): string | null {
  let curr = resolve(startDir)
  while (true) {
    const candidates = [
      resolve(curr, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject'),
      resolve(curr, 'apps', 'api', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject'),
    ]
    for (const dir of candidates) {
      if (existsSync(dir)) {
        try {
          const files = readdirSync(dir)
          const sqliteFile = files.find((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
          if (sqliteFile) return join(dir, sqliteFile)
        } catch {}
      }
    }
    const parent = resolve(curr, '..')
    if (parent === curr) break
    curr = parent
  }
  return null
}

/** Esegue SQL da file temporaneo via `wrangler d1 execute --file` o direct SQLite in local mode. Returns true on success. */
export function executeD1File(sql: string, options: WranglerOptions): boolean {
  validateDbName(options.db)
  if (options.local) {
    const sqlitePath = getLocalD1SqlitePath()
    if (sqlitePath) {
      try {
        const db = new DatabaseSync(sqlitePath)
        db.exec(sql)
        return true
      } catch {
        // fallback to wrangler CLI below if DatabaseSync fails
      }
    }
  }

  const tmpFile = join(tmpdir(), `beech-seed-${Date.now()}.sql`)
  try {
    writeFileSync(tmpFile, sql, 'utf-8')
    const args = ['d1', 'execute', options.db, '--file', tmpFile, ...buildArgs(options)]
    const result = spawnSync(process.execPath, [join(dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js'), ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      shell: false,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    return result.status === 0
  } finally {
    try { rmSync(tmpFile) } catch {}
  }
}

/**
 * Esegue una query SQL e ritorna i risultati come array di oggetti (--json).
 */
export function queryD1<T extends D1Row = D1Row>(sql: string, options: WranglerOptions): T[] {
  validateDbName(options.db)
  if (options.local) {
    const sqlitePath = getLocalD1SqlitePath()
    if (sqlitePath) {
      try {
        const db = new DatabaseSync(sqlitePath)
        return db.prepare(sql).all() as T[]
      } catch {
        // fallback to wrangler CLI below if DatabaseSync fails
      }
    }
  }

  const tmpFile = join(tmpdir(), `beech-query-${Date.now()}.sql`)
  let result: SpawnSyncReturns<string>
  try {
    writeFileSync(tmpFile, sql, 'utf-8')
    const args = ['d1', 'execute', options.db, '--file', tmpFile, '--json', ...buildArgs(options)]
    result = spawnSync(process.execPath, [join(dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js'), ...args], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      shell: false,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
  } finally {
    try { rmSync(tmpFile) } catch {}
  }

  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed:\n${result.stderr}`)
  }

  try {
    const parsed: WranglerResult[] = JSON.parse(result.stdout)
    return (parsed[0]?.results ?? []) as T[]
  } catch {
    throw new Error(`Failed to parse wrangler JSON output:\n${result.stdout}`)
  }
}

/** Trova il path di wrangler.jsonc risalendo l'albero da CWD fino alla root del filesystem. */
export function findWranglerConfig(): string | null {
  let dir = process.cwd()
  while (true) {
    for (const name of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
      const p = resolve(dir, name)
      if (existsSync(p)) return p
    }
    for (const name of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
      const p = resolve(dir, 'apps', 'api', name)
      if (existsSync(p)) return p
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Strips JSONC comments and trailing commas without touching string literals, so a value such as
 * `"APP_URL": "http://localhost:5173"` survives intact.
 */
export function stripJsonc(raw: string): string {
  let out = ''
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    const next = raw[i + 1]
    if (ch === '"') {
      const end = stringEnd(raw, i)
      out += raw.slice(i, end)
      i = end
    } else if (ch === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i++
    } else if (ch === '/' && next === '*') {
      const close = raw.indexOf('*/', i + 2)
      i = close === -1 ? raw.length : close + 2
    } else {
      out += ch
      i++
    }
  }
  return dropTrailingCommas(out)
}

/** Index just past the closing quote of the string literal that starts at `start`. */
function stringEnd(text: string, start: number): number {
  let j = start + 1
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
  return j + 1
}

/** Index of the first character at or after `from` that is not whitespace or part of a comment. */
function skipTrivia(text: string, from: number): number {
  let j = from
  while (j < text.length) {
    if (/\s/.test(text[j])) {
      j++
    } else if (text[j] === '/' && text[j + 1] === '/') {
      while (j < text.length && text[j] !== '\n') j++
    } else if (text[j] === '/' && text[j + 1] === '*') {
      const close = text.indexOf('*/', j + 2)
      j = close === -1 ? text.length : close + 2
    } else {
      break
    }
  }
  return j
}

/** Index of the `}` that closes the object opened at `open`, or -1 when the text ends first. */
function matchingBrace(text: string, open: number): number {
  let depth = 0
  let i = open
  while (i < text.length) {
    const next = skipTrivia(text, i)
    if (next !== i) {
      i = next
    } else if (text[i] === '"') {
      i = stringEnd(text, i)
    } else {
      if (text[i] === '{' || text[i] === '[') depth++
      else if (text[i] === '}' || text[i] === ']') depth--
      if (depth === 0) return i
      i++
    }
  }
  return -1
}

function isStringTokenFor(token: string, key: string): boolean {
  try {
    return JSON.parse(token) === key
  } catch {
    return false
  }
}

/**
 * Offsets of the `{` and its matching `}` for the top-level object member `key` in JSONC text. Strings and
 * comments are skipped, so a `"vars"` inside a value, a comment or a nested object is never matched.
 * Null when the member is absent or its value is not an object.
 */
export function findTopLevelObjectSpan(raw: string, key: string): { open: number; close: number } | null {
  let depth = 0
  let i = 0
  while (i < raw.length) {
    const next = skipTrivia(raw, i)
    if (next !== i) {
      i = next
    } else if (raw[i] === '"') {
      const end = stringEnd(raw, i)
      if (depth === 1 && isStringTokenFor(raw.slice(i, end), key)) {
        const colon = skipTrivia(raw, end)
        const open = skipTrivia(raw, colon + 1)
        if (raw[colon] === ':' && raw[open] === '{') {
          const close = matchingBrace(raw, open)
          return close === -1 ? null : { open, close }
        }
      }
      i = end
    } else {
      if (raw[i] === '{' || raw[i] === '[') depth++
      else if (raw[i] === '}' || raw[i] === ']') depth--
      i++
    }
  }
  return null
}

function skipWhitespace(text: string, from: number): number {
  let j = from
  while (j < text.length && /\s/.test(text[j])) j++
  return j
}

function isClosingBracket(text: string, at: number): boolean {
  return text[at] === '}' || text[at] === ']'
}

/** Removes a comma that is followed only by whitespace and a closing bracket, outside strings. */
function dropTrailingCommas(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '"') {
      const end = stringEnd(text, i)
      out += text.slice(i, end)
      i = end
    } else if (text[i] === ',' && isClosingBracket(text, skipWhitespace(text, i + 1))) {
      i++
    } else {
      out += text[i]
      i++
    }
  }
  return out
}

/**
 * Risolve il nome del database D1 da wrangler.jsonc/json/toml.
 * Senza config restituisce il default; con un config presente ma illeggibile o senza
 * `d1_databases` lancia, invece di puntare in silenzio a un database che non esiste.
 */
export function resolveDbName(configPath: string | null): string {
  if (!configPath) return 'beech-db'
  let name: string | undefined
  try {
    const raw = readFileSync(configPath, 'utf-8')

    if (configPath.endsWith('.toml')) {
      // Basic regex-based TOML parsing for d1_databases
      // Matches both [d1_databases] and [[d1_databases]]
      const d1SectionMatch = raw.match(/\[\[?d1_databases\]\]?[\s\S]*?(?=\n\[|$)/)
      name = d1SectionMatch?.[0].match(/database_name\s*=\s*["'](.+?)["']/)?.[1]
    } else {
      const parsed = JSON.parse(stripJsonc(raw))
      const bindings: { database_name?: string }[] = parsed?.d1_databases ?? []
      name = bindings[0]?.database_name
    }
  } catch (error) {
    throw new Error(
      `Cannot read the D1 database name from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!name) {
    throw new Error(`No d1_databases[0].database_name found in ${configPath}. Pass --db <name> or add a D1 binding.`)
  }
  return validateDbName(name)
}
