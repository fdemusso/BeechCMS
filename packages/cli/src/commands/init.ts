// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { findWranglerConfig, stripJsonc } from '../lib/wrangler.js'

export interface InitOptions {
  /** Local project (checks `.dev.vars`) as opposed to a remote-only check. */
  local: boolean
}

function echoApiKeys(configPath: string | null | undefined): void {
  if (!configPath) return
  try {
    const parsed = JSON.parse(stripJsonc(readFileSync(configPath, 'utf-8')))
    const vars: Record<string, string> = parsed?.vars ?? {}
    const readKey = vars['PUBLIC_READ_API_KEY']
    const writeKey = vars['PUBLIC_WRITE_API_KEY']
    if (!readKey && !writeKey) return
    console.log(pc.dim('  API keys detected in wrangler.jsonc:\n'))
    if (readKey) {
      const masked = readKey.length > 8 ? readKey.slice(0, 4) + '****' + readKey.slice(-4) : '****'
      console.log(pc.dim(`    PUBLIC_READ_API_KEY  = ${masked}`))
    }
    if (writeKey) {
      const masked = writeKey.length > 8 ? writeKey.slice(0, 4) + '****' + writeKey.slice(-4) : '****'
      console.log(pc.dim(`    PUBLIC_WRITE_API_KEY = ${masked}`))
    }
    console.log(pc.dim('\n  Use these in your frontend as the X-API-Key header.\n'))
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
      console.log(pc.dim('  ○ .dev.vars        — not found (optional: only needed for production R2 credentials)'))
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
    console.log(pc.dim('  Fix the errors above, or scaffold a new project with: npx @beechcms/cms my-app'))
    process.exit(1)
  }

  console.log(pc.green('\n  All required files present.\n'))
  echoApiKeys(findWranglerConfig())
  console.log(pc.dim('  Next steps:'))
  console.log(pc.cyan('  1. npm run dev'))
  console.log(pc.dim('      → apply local migrations and start API + dashboard'))
  console.log(pc.cyan('  2. Open http://localhost:8789/admin'))
  console.log(pc.dim('      → create the first admin and manage content types\n'))
}
