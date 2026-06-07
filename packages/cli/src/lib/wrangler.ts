// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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

/** Esegue SQL da file temporaneo via `wrangler d1 execute --file`. Returns true on success. */
export function executeD1File(sql: string, options: WranglerOptions): boolean {
  const tmpFile = join(tmpdir(), `beech-seed-${Date.now()}.sql`)
  try {
    writeFileSync(tmpFile, sql, 'utf-8')
    const args = ['d1', 'execute', options.db, '--file', tmpFile, ...buildArgs(options)]
    const result = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: process.cwd(), shell: true })
    return result.status === 0
  } finally {
    try { rmSync(tmpFile) } catch {}
  }
}

/**
 * Esegue una query SQL e ritorna i risultati come array di oggetti (--json).
 *
 * Passa il SQL via file temporaneo (`--file`) anziché `--command`: su Windows,
 * `spawnSync` con `shell: true` non preserva le virgolette/spazi/virgole interni
 * a un argomento inline, e wrangler riceve il comando spezzato in token sciolti
 * ("Unknown arguments: name, FROM, sqlite_master, …"). Il file evita del tutto
 * il riquoting della shell — stesso approccio di `executeD1File`.
 */
export function queryD1<T extends D1Row = D1Row>(sql: string, options: WranglerOptions): T[] {
  const tmpFile = join(tmpdir(), `beech-query-${Date.now()}.sql`)
  let result: SpawnSyncReturns<string>
  try {
    writeFileSync(tmpFile, sql, 'utf-8')
    const args = ['d1', 'execute', options.db, '--file', tmpFile, '--json', ...buildArgs(options)]
    result = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf-8', cwd: process.cwd(), shell: true })
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

/** Wraps a string value in single quotes, escaping internal single quotes for SQL literals. */
export function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Risolve il nome del database D1 da wrangler.jsonc (stripping JSONC comments). */
export function resolveDbName(configPath: string | null): string {
  if (!configPath) return 'beech-db'
  try {
    const raw = readFileSync(configPath, 'utf-8')
    
    if (configPath.endsWith('.toml')) {
      // Basic regex-based TOML parsing for d1_databases
      // Matches both [d1_databases] and [[d1_databases]]
      const d1SectionMatch = raw.match(/\[\[?d1_databases\]\]?[\s\S]*?(?=\n\[|$)/)
      if (d1SectionMatch) {
        const section = d1SectionMatch[0]
        const dbNameMatch = section.match(/database_name\s*=\s*["'](.+?)["']/)
        if (dbNameMatch) return dbNameMatch[1]
      }
      return 'beech-db'
    }

    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    const bindings: { database_name?: string }[] = parsed?.d1_databases ?? []
    return bindings[0]?.database_name ?? 'beech-db'
  } catch {
    return 'beech-db'
  }
}
