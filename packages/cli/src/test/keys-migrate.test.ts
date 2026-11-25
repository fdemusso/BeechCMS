// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Covers the pure planner and report on literal files, plus the command's refusal and write-order paths
 * with `node:fs` mocked. The files are literals because the CLI cannot import the scaffolder in `bin/`.
 */

import { basename } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('picocolors', () => ({
  default: {
    cyan: (s: string) => s,
    dim: (s: string) => s,
    gray: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    bold: (s: string) => s,
  },
}))

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { keyMigrationReport, keysMigrate, planKeyMigration, type KeyMigrationInput } from '../commands/keys-migrate.js'
import { CliError } from '../lib/d1-context.js'
import { parseDevVars } from '../lib/dev-vars.js'
import { MIGRATED_PRODUCTION_SECRETS } from '../lib/key-model.js'
import { findTopLevelObjectSpan, stripJsonc } from '../lib/wrangler.js'

const COMMITTED_JWT_SECRET = 'a'.repeat(64)
const COMMITTED_READ_KEY = 'b'.repeat(32)
const COMMITTED_WRITE_KEY = 'c'.repeat(32)
const COMMITTED_TIME_TRAP_SECRET = 'd'.repeat(64)
const PRIVACY_MASTER_KEY = 'e'.repeat(64)

const LEGACY_WRANGLER = `{
  "name": "legacy-app-api",
  "main": "worker.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "vars": {
    "ENV": "development",
    "JWT_SECRET": "${COMMITTED_JWT_SECRET}",
    "CORS_ORIGINS": "http://localhost:5173",
    "PUBLIC_READ_API_KEY": "${COMMITTED_READ_KEY}",
    "PUBLIC_WRITE_API_KEY": "${COMMITTED_WRITE_KEY}",
    "PUBLIC_TIME_TRAP_SECRET": "${COMMITTED_TIME_TRAP_SECRET}",
    "APP_URL": "http://localhost:5173"
  },

  "assets": {
    "binding": "ASSETS",
    "directory": "node_modules/@beechcms/api/assets/dashboard"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "legacy-app-db",
      "database_id": "local",
      "migrations_dir": "node_modules/@beechcms/api/migrations"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "legacy-app-media"
    }
  ]
}
`

const LEGACY_DEV_VARS = `# Media uploads work locally without any configuration: wrangler emulates R2 and the Worker stores the file.
# For direct uploads through presigned URLs (production), add your R2 S3 credentials here and with \`wrangler secret put\`:
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
# Guide: https://developers.cloudflare.com/r2/api/s3/tokens/

# Master key for protected fields (AES-GCM + blind index). Do NOT change once data is stored.
PRIVACY_MASTER_KEY=${PRIVACY_MASTER_KEY}
`

/** Deterministic stand-in for random secrets: 'f0000…', 'f1000…', each 64 characters. */
function sequentialSecrets() {
  let next = 0
  return vi.fn(() => `f${next++}`.padEnd(64, '0'))
}

function legacyInput(overrides: Partial<KeyMigrationInput> = {}): KeyMigrationInput {
  return {
    configName: 'wrangler.jsonc',
    wranglerRaw: LEGACY_WRANGLER,
    devVarsRaw: LEGACY_DEV_VARS,
    generateSecret: sequentialSecrets(),
    ...overrides,
  }
}

/** Minimal config whose vars hold exactly `members`, one per line. */
function configWith(members: string[]): string {
  return `{\n  "name": "app",\n  "vars": {\n${members.map((member) => `    ${member}`).join(',\n')}\n  }\n}\n`
}

function parseVars(raw: string): Record<string, string> {
  return JSON.parse(stripJsonc(raw)).vars
}

function withoutVars(raw: string): string {
  const span = findTopLevelObjectSpan(raw, 'vars')
  return span ? raw.slice(0, span.open) + raw.slice(span.close + 1) : raw
}

describe('planKeyMigration', () => {
  it('removes the four legacy names and puts the publishable key where the read key was', () => {
    const input = legacyInput()

    const result = planKeyMigration(input)

    expect(Object.keys(parseVars(result.wranglerRaw))).toEqual(['ENV', 'CORS_ORIGINS', 'BEECH_PUBLISHABLE_KEY', 'APP_URL'])
    expect(parseVars(result.wranglerRaw).BEECH_PUBLISHABLE_KEY).toBe('beech_pk_dev')
    expect(withoutVars(result.wranglerRaw)).toBe(withoutVars(LEGACY_WRANGLER))
    expect(result.removedVars).toEqual(['PUBLIC_READ_API_KEY', 'PUBLIC_WRITE_API_KEY', 'JWT_SECRET', 'PUBLIC_TIME_TRAP_SECRET'])
  })

  it('writes fresh secrets and the local secret key to .dev.vars and keeps every existing line', () => {
    const input = legacyInput()

    const result = planKeyMigration(input)

    const devVars = parseDevVars(result.devVarsRaw)
    expect(devVars.JWT_SECRET).toBe('f0'.padEnd(64, '0'))
    expect(devVars.PUBLIC_TIME_TRAP_SECRET).toBe('f1'.padEnd(64, '0'))
    expect(devVars.BEECH_SECRET_KEY).toBe('beech_sk_dev')
    expect(result.devVarsRaw.startsWith(LEGACY_DEV_VARS)).toBe(true)
    expect(result.rotated).toEqual(['JWT_SECRET', 'PUBLIC_TIME_TRAP_SECRET'])
    expect(result.added).toEqual(['BEECH_PUBLISHABLE_KEY', 'BEECH_SECRET_KEY'])
    // Regression guard: copying the committed values would keep secrets that sit in the git history valid
    expect(result.devVarsRaw).not.toContain(COMMITTED_JWT_SECRET)
    expect(result.devVarsRaw).not.toContain(COMMITTED_TIME_TRAP_SECRET)
  })

  it('returns identical contents and empty arrays on its own output without drawing a secret', () => {
    const first = planKeyMigration(legacyInput())
    const generateSecret = sequentialSecrets()

    const second = planKeyMigration({ ...legacyInput(), wranglerRaw: first.wranglerRaw, devVarsRaw: first.devVarsRaw, generateSecret })

    expect(second.wranglerRaw).toBe(first.wranglerRaw)
    expect(second.devVarsRaw).toBe(first.devVarsRaw)
    expect([second.removedVars, second.rotated, second.added]).toEqual([[], [], []])
    expect(generateSecret).not.toHaveBeenCalled()
  })

  it.each([
    ['committed in vars and present in .dev.vars', true, true, true],
    ['present in .dev.vars only', false, true, false],
    ['in neither file', false, false, true],
  ])('a secret rotates iff it was committed in vars or is missing from .dev.vars: %s', (_label, inVars, inDevVars, rotates) => {
    const members = ['"ENV": "development"', ...(inVars ? ['"JWT_SECRET": "committed"'] : [])]
    const devVarsRaw = inDevVars ? 'JWT_SECRET=existing\n' : ''

    const result = planKeyMigration(legacyInput({ wranglerRaw: configWith(members), devVarsRaw }))

    expect(result.rotated.includes('JWT_SECRET')).toBe(rotates)
    expect(parseDevVars(result.devVarsRaw).JWT_SECRET).toBe(rotates ? 'f0'.padEnd(64, '0') : 'existing')
  })

  it('keeps an existing publishable key in vars and an existing secret key in .dev.vars', () => {
    const wranglerRaw = configWith(['"BEECH_PUBLISHABLE_KEY": "pk_custom"', '"PUBLIC_READ_API_KEY": "old"'])
    const devVarsRaw = 'JWT_SECRET=j\nBEECH_SECRET_KEY=sk_custom\nPUBLIC_TIME_TRAP_SECRET=t\n'

    const result = planKeyMigration(legacyInput({ wranglerRaw, devVarsRaw }))

    expect(parseVars(result.wranglerRaw)).toEqual({ BEECH_PUBLISHABLE_KEY: 'pk_custom' })
    expect(parseDevVars(result.devVarsRaw).BEECH_SECRET_KEY).toBe('sk_custom')
    expect(result.added).toEqual([])
  })

  it('leaves the new last member of vars without a trailing comma when the last member was removed', () => {
    const wranglerRaw = configWith(['"ENV": "development"', '"BEECH_PUBLISHABLE_KEY": "beech_pk_dev"', '"PUBLIC_WRITE_API_KEY": "w"'])

    const result = planKeyMigration(legacyInput({ wranglerRaw }))

    const lines = result.wranglerRaw.split('\n')
    expect(lines[lines.indexOf('  }') - 1]).toBe('    "BEECH_PUBLISHABLE_KEY": "beech_pk_dev"')
  })

  it('keeps CRLF line endings in both files', () => {
    const wranglerRaw = LEGACY_WRANGLER.replace(/\n/g, '\r\n')
    const devVarsRaw = LEGACY_DEV_VARS.replace(/\n/g, '\r\n')

    const result = planKeyMigration(legacyInput({ wranglerRaw, devVarsRaw }))

    expect(result.wranglerRaw.replace(/\r\n/g, '')).not.toContain('\n')
    expect(result.devVarsRaw.replace(/\r\n/g, '')).not.toContain('\n')
    expect(Object.keys(parseVars(result.wranglerRaw))).toEqual(['ENV', 'CORS_ORIGINS', 'BEECH_PUBLISHABLE_KEY', 'APP_URL'])
  })

  it('never moves or generates PRIVACY_MASTER_KEY', () => {
    const wranglerRaw = configWith(['"PRIVACY_MASTER_KEY": "in-vars"', '"PUBLIC_READ_API_KEY": "old"'])
    const devVarsRaw = '# no master key here\n'

    const result = planKeyMigration(legacyInput({ wranglerRaw, devVarsRaw }))

    expect(parseVars(result.wranglerRaw).PRIVACY_MASTER_KEY).toBe('in-vars')
    expect(result.devVarsRaw).not.toContain('PRIVACY_MASTER_KEY')
  })

  it.each([
    ['invalid JSONC', '{ "vars": '],
    ['no top-level vars', '{ "name": "app" }'],
    ['a legacy name in env.production.vars', '{\n  "vars": {\n    "ENV": "x"\n  },\n  "env": { "production": { "vars": { "JWT_SECRET": "x" } } }\n}\n'],
    ['two legacy members on one line', configWith(['"PUBLIC_READ_API_KEY": "b", "PUBLIC_WRITE_API_KEY": "c"', '"APP_URL": "x"'])],
  ])('an unsafe config throws CliError and returns nothing: %s', (_label, wranglerRaw) => {
    const plan = () => planKeyMigration(legacyInput({ wranglerRaw }))

    expect(plan).toThrow(CliError)
  })
})

describe('keyMigrationReport', () => {
  it('reports exactly one line and no production command when nothing changed', () => {
    const emptyPlan = { wranglerRaw: '', devVarsRaw: '', removedVars: [], rotated: [], added: [] }

    const result = keyMigrationReport(emptyPlan, 'wrangler.jsonc')

    expect(result).toHaveLength(1)
    expect(result.join('\n')).not.toContain('wrangler secret put')
  })

  it('prints npm run deploy before one secret put line per migrated secret and none for PRIVACY_MASTER_KEY', () => {
    const plan = planKeyMigration(legacyInput())

    const result = keyMigrationReport(plan, 'wrangler.jsonc')

    const secretPutLines = result.filter((line) => line.includes('wrangler secret put'))
    expect(secretPutLines.map((line) => line.trim())).toEqual(MIGRATED_PRODUCTION_SECRETS.map((name) => `npx wrangler secret put ${name}`))
    const deployIndex = result.findIndex((line) => line.includes('npm run deploy'))
    expect(deployIndex).toBeGreaterThanOrEqual(0)
    expect(deployIndex).toBeLessThan(result.findIndex((line) => line.includes('wrangler secret put')))
  })

  it('never prints a value from the input files or the planned files, except the publishable key', () => {
    const plan = planKeyMigration(legacyInput())
    const values = [
      ...Object.values(parseDevVars(LEGACY_DEV_VARS)),
      ...Object.values(parseDevVars(plan.devVarsRaw)),
      COMMITTED_JWT_SECRET,
      COMMITTED_READ_KEY,
      COMMITTED_WRITE_KEY,
      COMMITTED_TIME_TRAP_SECRET,
    ].filter((value) => value !== 'beech_pk_dev')

    const report = keyMigrationReport(plan, 'wrangler.jsonc').join('\n')

    expect(values.length).toBeGreaterThanOrEqual(8)
    expect(values.filter((value) => report.includes(value))).toEqual([])
  })

  it('warns about the git history only when legacy names were removed', () => {
    const migrated = planKeyMigration(legacyInput())
    const secretKeyOnly = { ...migrated, removedVars: [], rotated: [], added: ['BEECH_SECRET_KEY'] }

    const reports = [migrated, secretKeyOnly].map((plan) => keyMigrationReport(plan, 'wrangler.jsonc').join('\n').includes('git history'))

    expect(reports).toEqual([true, false])
  })
})

describe('keysMigrate', () => {
  function mockProject(files: Record<string, string>): void {
    vi.mocked(existsSync).mockImplementation((path) => basename(String(path)) in files)
    vi.mocked(readFileSync).mockImplementation(((path: string) => files[basename(String(path))]) as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it.each([
    ['no wrangler.jsonc or wrangler.json', {}],
    ['only wrangler.toml', { 'wrangler.toml': 'name = "app"' }],
    ['a config without .dev.vars', { 'wrangler.jsonc': LEGACY_WRANGLER }],
  ])('stops with exit 1 and writes nothing with %s', async (_label, files) => {
    mockProject(files)

    const run = keysMigrate()

    await expect(run).rejects.toThrow('process.exit')
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('writes .dev.vars before the config on a 0.10.x project', async () => {
    mockProject({ 'wrangler.jsonc': LEGACY_WRANGLER, '.dev.vars': LEGACY_DEV_VARS })

    await keysMigrate()

    const writtenFiles = vi.mocked(writeFileSync).mock.calls.map(([path]) => basename(String(path)))
    expect(writtenFiles).toEqual(['.dev.vars', 'wrangler.jsonc'])
  })

  it('writes nothing on an already migrated project', async () => {
    const migrated = planKeyMigration(legacyInput())
    mockProject({ 'wrangler.jsonc': migrated.wranglerRaw, '.dev.vars': migrated.devVarsRaw })

    await keysMigrate()

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
