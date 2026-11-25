// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseDevVars } from '../lib/dev-vars.js'
import { legacyVarNames } from '../lib/key-model.js'
import { findWranglerConfig, stripJsonc } from '../lib/wrangler.js'

export interface InitOptions {
  /** Local project (checks `.dev.vars`) as opposed to a remote-only check. */
  local: boolean
}

/**
 * Lines reporting the Public API keys of a project. Reports the publishable key in full and only the
 * presence of the secret key; empty when the project has neither (`init` warns separately about 0.10.x names).
 */
export function keyReportLines(input: {
  wranglerVars: Record<string, string>
  devVars: Record<string, string> | null
}): string[] {
  const publishableKey = input.wranglerVars['BEECH_PUBLISHABLE_KEY']?.trim()
  const hasSecretKey = Boolean(input.devVars?.['BEECH_SECRET_KEY']?.trim())
  if (!publishableKey && !hasSecretKey) return []

  const lines: string[] = []
  if (publishableKey) {
    lines.push(`BEECH_PUBLISHABLE_KEY = ${publishableKey} (wrangler.jsonc, read only, safe in the browser)`)
  }
  if (hasSecretKey) {
    lines.push('BEECH_SECRET_KEY = set in .dev.vars (server only, never printed)')
  } else if (input.devVars) {
    lines.push('BEECH_SECRET_KEY = missing from .dev.vars: writes answer 403')
  }
  return lines
}

function echoKeys(configPath: string | null | undefined, devVarsPath: string): void {
  if (!configPath) return
  try {
    const parsed = JSON.parse(stripJsonc(readFileSync(configPath, 'utf-8')))
    const wranglerVars: Record<string, string> = parsed?.vars ?? {}
    const devVars = existsSync(devVarsPath) ? parseDevVars(readFileSync(devVarsPath, 'utf-8')) : null
    const legacyNames = legacyVarNames(wranglerVars)
    if (legacyNames.length > 0) {
      console.log(pc.yellow(`  ! ${basename(configPath)} still has 0.10.x key names in vars: ${legacyNames.join(', ')}`))
      console.log(pc.yellow('    The runtime no longer reads them, and any secret listed here is committed: rotate it.'))
      console.log(pc.yellow('    Run: npx beech keys:migrate\n'))
    }
    const lines = keyReportLines({ wranglerVars, devVars })
    if (lines.length === 0) return
    console.log(pc.dim('  Public API keys:\n'))
    for (const line of lines) console.log(pc.dim(`    ${line}`))
    console.log(pc.dim('\n  Send a key in the X-API-Key header. The publishable key is safe in browser code; the secret key is not.\n'))
  } catch {
    // wrangler.jsonc may be missing or malformed — skip silently
  }
}

/**
 * Ensures `.dev.vars` holds a PRIVACY_MASTER_KEY. Never overwrites a non-empty value:
 * rotating the key makes already-protected fields unreadable.
 */
function ensurePrivacyMasterKey(devVarsPath: string): boolean {
  const content = readFileSync(devVarsPath, 'utf8')
  const lines = content.split(/\r?\n/)
  const index = lines.findIndex((line) => /^PRIVACY_MASTER_KEY=/.test(line))
  if (index !== -1 && lines[index].slice('PRIVACY_MASTER_KEY='.length).trim() !== '') return false

  const entry = `PRIVACY_MASTER_KEY=${randomBytes(32).toString('hex')}`
  if (index !== -1) {
    lines[index] = entry
    writeFileSync(devVarsPath, lines.join('\n'), 'utf8')
  } else {
    const separator = content === '' || content.endsWith('\n') ? '' : '\n'
    appendFileSync(devVarsPath, `${separator}\n# Master key for protected fields (AES-GCM + blind index). Do NOT change once data is stored.\n${entry}\n`, 'utf8')
  }
  return true
}

function checkFiles(cwd: string, checkDevVars: boolean): boolean {
  let ok = true

  const workerExists = existsSync(resolve(cwd, 'worker.ts')) || existsSync(resolve(cwd, 'worker.js'))
  if (!workerExists) {
    console.log(pc.red('  ✗ worker.ts        — missing (required)'))
    ok = false
  } else {
    console.log(pc.green('  ✓ worker.ts'))
  }

  const configPath = findWranglerConfig()
  const configInCwd = configPath &&
    (configPath === resolve(cwd, 'wrangler.jsonc') ||
     configPath === resolve(cwd, 'wrangler.json') ||
     configPath === resolve(cwd, 'wrangler.toml'))

  if (!configInCwd) {
    console.log(pc.red('  ✗ wrangler.jsonc   — missing (required)'))
    ok = false
  } else {
    console.log(pc.green(`  ✓ ${basename(configPath!)}`))
  }

  if (checkDevVars) {
    if (!existsSync(resolve(cwd, '.dev.vars'))) {
      console.log(pc.red('  ✗ .dev.vars        — missing (required: holds JWT_SECRET, BEECH_SECRET_KEY, PUBLIC_TIME_TRAP_SECRET, PRIVACY_MASTER_KEY)'))
      ok = false
    } else {
      console.log(pc.green('  ✓ .dev.vars'))
      if (ensurePrivacyMasterKey(resolve(cwd, '.dev.vars'))) {
        console.log(pc.green('  ✓ PRIVACY_MASTER_KEY — generated in .dev.vars'))
      }
    }
  }

  return ok
}

/**
 * Checks that the project has the files BeechCMS needs. The database is not touched here:
 * `npm run dev` applies the system migrations, and `beech setup:cloudflare` provisions D1/R2.
 */
export async function init(args: InitOptions): Promise<void> {
  console.log(pc.cyan('\n  beech init — project check\n'))

  if (!checkFiles(process.cwd(), args.local)) {
    console.log(pc.red('\n  ✗ Required files missing\n'))
    console.log(pc.dim('  Fix the errors above, or scaffold a new project with: npx @beechcms/cms@latest my-app'))
    process.exit(1)
  }

  console.log(pc.green('\n  All required files present.\n'))
  echoKeys(findWranglerConfig(), resolve(process.cwd(), '.dev.vars'))
  console.log(pc.dim('  Next steps:'))
  console.log(pc.cyan('  1. npm run dev'))
  console.log(pc.dim('      → apply local migrations and start API + dashboard'))
  console.log(pc.cyan('  2. Open http://localhost:8789/admin'))
  console.log(pc.dim('      → create the first admin and manage content types\n'))
}
