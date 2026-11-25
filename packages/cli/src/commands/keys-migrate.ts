// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseDevVars, upsertDevVars } from '../lib/dev-vars.js'
import { CliError, exitWithError } from '../lib/d1-context.js'
import {
  DEV_PUBLISHABLE_KEY,
  DEV_SECRET_KEY,
  LEGACY_KEY_VARS,
  MIGRATED_PRODUCTION_SECRETS,
  legacyVarNames,
} from '../lib/key-model.js'
import { findTopLevelObjectSpan, stripJsonc } from '../lib/wrangler.js'

const PUBLISHABLE_KEY_NAME = 'BEECH_PUBLISHABLE_KEY'
const SECRET_KEY_NAME = 'BEECH_SECRET_KEY'
const [READ_KEY_NAME] = LEGACY_KEY_VARS
const VARS_INDENT = '  '

export interface KeyMigrationInput {
  /** Basename of the config file, used in messages: 'wrangler.jsonc' or 'wrangler.json'. */
  configName: string
  /** Content of the config file. */
  wranglerRaw: string
  /** Content of `.dev.vars`. */
  devVarsRaw: string
  /** Returns a fresh secret on every call (production: 32 random bytes, hex). Injected so tests are deterministic. */
  generateSecret: () => string
}

export interface KeyMigrationPlan {
  /** New config content; identical to the input when nothing changes. */
  wranglerRaw: string
  /** New `.dev.vars` content; identical to the input when nothing changes. */
  devVarsRaw: string
  /** Names removed from `vars`, as returned by `legacyVarNames`. */
  removedVars: string[]
  /** `.dev.vars` names that received a fresh generated value, in EXPOSED_SECRET_VARS order. */
  rotated: string[]
  /** Names added with their local value: 'BEECH_PUBLISHABLE_KEY' (vars), then 'BEECH_SECRET_KEY' (.dev.vars). */
  added: string[]
}

type JsonObject = Record<string, unknown>

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConfig(configName: string, wranglerRaw: string): JsonObject {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonc(wranglerRaw))
  } catch {
    throw new CliError(
      `${configName} is not valid JSONC`,
      'Fix the syntax error in the file, then run `npx beech keys:migrate` again.',
    )
  }
  if (!isPlainObject(parsed)) {
    throw new CliError(`${configName} is not valid JSONC`, 'The file must hold one JSON object.')
  }
  return parsed
}

function manualEditHint(removed: string[]): string {
  const removal = removed.length > 0 ? `remove ${removed.join(', ')} from "vars", ` : ''
  return `Edit "vars" by hand: ${removal}add "${PUBLISHABLE_KEY_NAME}": "${DEV_PUBLISHABLE_KEY}" if missing, then run \`npx beech keys:migrate\` again.`
}

function unsafeVarsError(configName: string, removed: string[]): CliError {
  return new CliError(`${configName} vars cannot be edited safely`, manualEditHint(removed))
}

/** `env.<name>.vars.<KEY>` paths of legacy names inside Wrangler environments. */
function legacyNamesInEnvironments(config: JsonObject): string[] {
  const environments = isPlainObject(config.env) ? config.env : {}
  return Object.entries(environments).flatMap(([envName, environment]) => {
    const envVars = isPlainObject(environment) && isPlainObject(environment.vars) ? environment.vars : {}
    return legacyVarNames(envVars).map((key) => `env.${envName}.vars.${key}`)
  })
}

function secretEntries(
  removed: string[],
  devVars: Record<string, string>,
  generateSecret: () => string,
): { entries: Record<string, string>; rotated: string[]; secretKeyAdded: boolean } {
  const entries: Record<string, string> = {}
  const rotated: string[] = []
  let secretKeyAdded = false
  for (const name of MIGRATED_PRODUCTION_SECRETS) {
    const isBlank = !devVars[name]?.trim()
    if (name === SECRET_KEY_NAME) {
      if (isBlank) {
        entries[name] = DEV_SECRET_KEY
        secretKeyAdded = true
      }
    } else if (removed.includes(name) || isBlank) {
      // The value committed in vars is in the git history, so it is never copied
      entries[name] = generateSecret()
      rotated.push(name)
    }
  }
  return { entries, rotated, secretKeyAdded }
}

/** A line that holds only the `vars` member `name`: one scalar value, optional comma and `//` comment. */
function memberLinePattern(name: string): RegExp {
  return new RegExp(String.raw`^\s*"${name}"\s*:\s*(?:"(?:[^"\\]|\\.)*"|[^,\s"/{}\[\]]+)\s*,?\s*(?://.*)?$`)
}

/** Splits a member line into its code and its trailing `//` comment (whitespace included). */
function splitTrailingComment(line: string): { code: string; comment: string } {
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      i++
      while (i < line.length && line[i] !== '"') i += line[i] === '\\' ? 2 : 1
      i++
    } else if (line[i] === '/' && line[i + 1] === '/') {
      const code = line.slice(0, i).trimEnd()
      return { code, comment: line.slice(code.length) }
    } else {
      i++
    }
  }
  return { code: line, comment: '' }
}

function isMemberLine(line: string): boolean {
  return line.trimStart().startsWith('"')
}

function lastMemberIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (isMemberLine(lines[index])) return index
  }
  return -1
}

/** Makes every member line except the last end with a comma, and the last end without one. */
function normalizeMemberCommas(lines: string[]): string[] {
  const lastMember = lastMemberIndex(lines)
  return lines.map((line, index) => {
    if (!isMemberLine(line)) return line
    const { code, comment } = splitTrailingComment(line)
    const bare = code.replace(/,$/, '')
    return `${index === lastMember ? bare : `${bare},`}${comment}`
  })
}

function lineIndexOf(raw: string, offset: number, eol: string): number {
  return raw.slice(0, offset).split(eol).length - 1
}

/** Rewrites only the member lines of `vars`; every byte outside them is kept. */
function editVars(
  input: KeyMigrationInput,
  span: { open: number; close: number },
  removed: string[],
  publishableMissing: boolean,
): { wranglerRaw: string; publishableAdded: boolean } {
  const { configName, wranglerRaw } = input
  const eol = wranglerRaw.includes('\r\n') ? '\r\n' : '\n'
  const lines = wranglerRaw.split(eol)
  const openLine = lineIndexOf(wranglerRaw, span.open, eol)
  const closeLine = lineIndexOf(wranglerRaw, span.close, eol)
  if (openLine === closeLine && (removed.length > 0 || publishableMissing)) {
    throw unsafeVarsError(configName, removed)
  }

  const inner: Array<string | null> = lines.slice(openLine + 1, closeLine)
  let publishableAdded = false
  for (const name of removed) {
    const index = inner.findIndex((line) => line !== null && memberLinePattern(name).test(line))
    if (index === -1) continue
    if (name === READ_KEY_NAME && publishableMissing && !publishableAdded) {
      const indent = /^\s*/.exec(inner[index] as string)![0]
      inner[index] = `${indent}"${PUBLISHABLE_KEY_NAME}": "${DEV_PUBLISHABLE_KEY}"`
      publishableAdded = true
    } else {
      inner[index] = null
    }
  }

  const kept = inner.filter((line): line is string => line !== null)
  if (publishableMissing && !publishableAdded) {
    const lastMember = lastMemberIndex(kept)
    const indent = lastMember === -1
      ? `${/^\s*/.exec(lines[openLine])![0]}${VARS_INDENT}`
      : /^\s*/.exec(kept[lastMember])![0]
    kept.splice(lastMember === -1 ? kept.length : lastMember + 1, 0, `${indent}"${PUBLISHABLE_KEY_NAME}": "${DEV_PUBLISHABLE_KEY}"`)
    publishableAdded = true
  }

  const edited = [...lines.slice(0, openLine + 1), ...normalizeMemberCommas(kept), ...lines.slice(closeLine)]
  return { wranglerRaw: edited.join(eol), publishableAdded }
}

/** Throws unless the edit removed exactly `removed`, added exactly the publishable key, and touched nothing else. */
function assertSafeEdit(
  input: KeyMigrationInput,
  original: JsonObject,
  originalVars: JsonObject,
  edited: string,
  removed: string[],
  publishableAdded: boolean,
): void {
  const unsafe = unsafeVarsError(input.configName, removed)
  let after: JsonObject
  try {
    const parsed: unknown = JSON.parse(stripJsonc(edited))
    if (!isPlainObject(parsed)) throw unsafe
    after = parsed
  } catch {
    throw unsafe
  }

  const withoutVars = (config: JsonObject) => Object.fromEntries(Object.entries(config).filter(([name]) => name !== 'vars'))
  const originalRest = withoutVars(original)
  const afterRest = withoutVars(after)
  const afterVars = after.vars
  const expectedVars = Object.fromEntries(Object.entries(originalVars).filter(([name]) => !removed.includes(name)))
  if (publishableAdded) expectedVars[PUBLISHABLE_KEY_NAME] = DEV_PUBLISHABLE_KEY

  const isSafe =
    isDeepStrictEqual(afterRest, originalRest) &&
    isPlainObject(afterVars) &&
    isDeepStrictEqual(afterVars, expectedVars) &&
    legacyVarNames(afterVars).length === 0
  if (!isSafe) throw unsafe
}

/** Computes the migration of a 0.10.x project. Throws CliError when the config cannot be edited safely. */
export function planKeyMigration(input: KeyMigrationInput): KeyMigrationPlan {
  const { configName, wranglerRaw, devVarsRaw, generateSecret } = input

  const config = parseConfig(configName, wranglerRaw)
  const vars = config.vars
  const span = findTopLevelObjectSpan(wranglerRaw, 'vars')
  if (!isPlainObject(vars) || !span) {
    throw new CliError(
      `${configName} has no "vars" object to migrate`,
      `Add "vars": { "${PUBLISHABLE_KEY_NAME}": "${DEV_PUBLISHABLE_KEY}" } by hand, then run \`npx beech keys:migrate\` again.`,
    )
  }

  const environmentPaths = legacyNamesInEnvironments(config)
  if (environmentPaths.length > 0) {
    throw new CliError(
      `${configName} keeps legacy keys inside environments: ${environmentPaths.join(', ')}`,
      'Only top-level "vars" is migrated. Move these values by hand (Wrangler does not inherit vars into environments), then run `npx beech keys:migrate` again.',
    )
  }

  const removed = legacyVarNames(vars)
  const { entries, rotated, secretKeyAdded } = secretEntries(removed, parseDevVars(devVarsRaw), generateSecret)
  const newDevVarsRaw = Object.keys(entries).length > 0 ? upsertDevVars(devVarsRaw, entries) : devVarsRaw

  const publishableMissing = !Object.prototype.hasOwnProperty.call(vars, PUBLISHABLE_KEY_NAME)
  if (removed.length === 0 && !publishableMissing) {
    return { wranglerRaw, devVarsRaw: newDevVarsRaw, removedVars: [], rotated, added: secretKeyAdded ? [SECRET_KEY_NAME] : [] }
  }

  const edit = editVars(input, span, removed, publishableMissing)
  assertSafeEdit(input, config, vars, edit.wranglerRaw, removed, edit.publishableAdded)

  return {
    wranglerRaw: edit.wranglerRaw,
    devVarsRaw: newDevVarsRaw,
    removedVars: removed,
    rotated,
    added: [...(edit.publishableAdded ? [PUBLISHABLE_KEY_NAME] : []), ...(secretKeyAdded ? [SECRET_KEY_NAME] : [])],
  }
}

/**
 * Lines to print after a migration. Never contains a value from either file except DEV_PUBLISHABLE_KEY.
 * Prefixes carry the style: `  ! ` is a warning, six spaces is a command to copy.
 */
export function keyMigrationReport(plan: KeyMigrationPlan, configName: string): string[] {
  const { removedVars, rotated, added } = plan
  if (removedVars.length === 0 && rotated.length === 0 && added.length === 0) {
    return ['  Already on publishable and secret keys: nothing to change.']
  }

  const lines: string[] = []
  if (removedVars.length > 0) lines.push(`  ✓ Removed from ${configName} vars: ${removedVars.join(', ')}`)
  if (added.includes(PUBLISHABLE_KEY_NAME)) {
    lines.push(`  ✓ Added ${PUBLISHABLE_KEY_NAME} = ${DEV_PUBLISHABLE_KEY} to ${configName} vars (read only, safe in the browser)`)
  }
  if (rotated.length > 0) lines.push(`  ✓ Fresh values written to .dev.vars: ${rotated.join(', ')}`)
  if (added.includes(SECRET_KEY_NAME)) lines.push(`  ✓ ${SECRET_KEY_NAME} set in .dev.vars to the local development key`)
  lines.push('  ✓ PRIVACY_MASTER_KEY was not touched')

  if (removedVars.length > 0) {
    lines.push(
      '',
      '  ! The old values are still in the git history: treat them as compromised.',
      '    Only rotation makes them harmless, and this command does not rewrite history.',
    )
    if (removedVars.includes('JWT_SECRET')) {
      lines.push('  ! Sessions signed with the old JWT_SECRET stop working: everyone signs in again.')
    }
  }

  let step = 1
  lines.push('', '  Production, run by hand (this command never writes to Cloudflare):')
  if (removedVars.length > 0) {
    lines.push(
      `    ${step++}. Deploy first. A secret cannot share its name with a plain-text var (Cloudflare error 10053),`,
      '       so the deploy must remove the old vars. Logins and secret-key writes fail until step 2 is done.',
      '      npm run deploy',
    )
  }
  lines.push(`    ${step++}. Set each secret to a fresh value:`)
  for (const name of MIGRATED_PRODUCTION_SECRETS) lines.push(`      npx wrangler secret put ${name}`)
  lines.push(
    `    ${step++}. Use fresh values, never the local ones or the old committed ones. The production secret key starts with beech_sk_live_.`,
    '      node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    '      node -e "console.log(\'beech_sk_live_\' + require(\'crypto\').randomBytes(16).toString(\'hex\'))"',
    `    ${step++}. Never set a new PRIVACY_MASTER_KEY: protected fields become unreadable.`,
    `    ${step}. Clients: browser code sends the publishable key, server code sends the secret key (@beechcms/client: publishableKey / secretKey).`,
  )
  return lines
}

function styleReportLine(line: string): string {
  if (line.startsWith('  ! ')) return pc.yellow(line)
  if (line.startsWith('      ') && !line.startsWith('       ')) return pc.cyan(line)
  return line
}

function readProjectFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    throw new CliError(`Cannot read ${basename(path)}`, error instanceof Error ? error.message : String(error))
  }
}

/** `beech keys:migrate`, run from the project root: moves a 0.10.x project to publishable/secret keys. */
export async function keysMigrate(): Promise<void> {
  try {
    const cwd = process.cwd()
    const configPath = [resolve(cwd, 'wrangler.jsonc'), resolve(cwd, 'wrangler.json')].find((path) => existsSync(path))
    if (!configPath) {
      throw new CliError(
        existsSync(resolve(cwd, 'wrangler.toml'))
          ? 'only wrangler.jsonc / wrangler.json can be migrated'
          : 'no wrangler.jsonc in this folder: run from the project root',
        'Move the keys by hand, or convert the config to wrangler.jsonc.',
      )
    }
    const devVarsPath = resolve(cwd, '.dev.vars')
    if (!existsSync(devVarsPath)) {
      throw new CliError(
        'no .dev.vars in this folder: run from the project root',
        'It normally holds PRIVACY_MASTER_KEY: restore it from a backup, never generate a new one once data is stored.',
      )
    }

    const configName = basename(configPath)
    const wranglerRaw = readProjectFile(configPath)
    const devVarsRaw = readProjectFile(devVarsPath)
    const plan = planKeyMigration({
      configName,
      wranglerRaw,
      devVarsRaw,
      generateSecret: () => randomBytes(32).toString('hex'),
    })

    // Secrets first: if the config write fails, a re-run still converges
    if (plan.devVarsRaw !== devVarsRaw) writeFileSync(devVarsPath, plan.devVarsRaw, 'utf-8')
    if (plan.wranglerRaw !== wranglerRaw) writeFileSync(configPath, plan.wranglerRaw, 'utf-8')

    console.log(pc.cyan('\n  beech keys:migrate — publishable and secret keys\n'))
    for (const line of keyMigrationReport(plan, configName)) console.log(styleReportLine(line))
    console.log('')
  } catch (error) {
    exitWithError(error)
  }
}
