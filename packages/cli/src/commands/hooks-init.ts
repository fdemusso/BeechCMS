// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { exitWithError } from '../lib/d1-context.js'

export const HOOKS_INIT_PATHS = {
  hooks: 'hooks.ts',
  worker: 'worker.ts',
} as const

export const HOOKS_TEMPLATE = `import { HookValidationError, type BeechHooks } from '@beechcms/core'

/**
 * Programmatic lifecycle hooks wired into \`createBeechApp({ hooks })\`.
 *
 * Hard D1 constraints:
 * - \`BeechHooks\` is global across all seeds: always scope logic with \`ctx.seed.slug\`.
 * - \`after*\` hooks run post-commit and CANNOT roll back D1 writes. Put aborting checks in \`before*\`.
 * - \`ctx.repository.mutateField\` (atomic counters with min/max guards) and \`ctx.repository.runBatch\`
 *   (multi-seed atomic batches) bypass document-level hooks.
 */
export const hooks: BeechHooks = {
  beforeCreate: async (data, ctx) => {
    // Example: scope to a specific seed and enforce cross-field validation (HTTP 422 with errors[])
    if (ctx.seed.slug === 'events') {
      if (data.end_date && data.start_date && data.end_date < data.start_date) {
        throw new HookValidationError('end_date must be on or after start_date', [
          { field: 'end_date', message: 'must be on or after start_date' },
        ])
      }
    }

    return data
  },

  beforeUpdate: async (_id, patches, _ctx) => {
    return patches
  },
}
`

export type HooksInitAction = 'create' | 'update' | 'unchanged' | 'skip'

export interface HooksInitFile {
  path: string
  action: HooksInitAction
  reason?: string
  content?: string
}

export interface HooksInitInput {
  existing: Readonly<Record<string, string | null>>
  force: boolean
}

export interface HooksInitOptions {
  force?: boolean
}

const STARTER_WORKER_RE =
  /^(\/\/\/ <reference types="@cloudflare\/workers-types" \/>\r?\n)?import \{ createBeechApp \} from '@beechcms\/api'\r?\n\r?\nexport default createBeechApp\(\{ seeds: \[\] \}\)\r?\n?$/

const DIFFERS_REASON = 'differs from the template; --force overwrites'
const MISSING_WORKER_REASON = 'worker.ts not found; wire hooks manually in your createBeechApp({ hooks }) entrypoint'
const CUSTOM_WORKER_REASON = 'worker.ts is customized; wire `import { hooks } from \'./hooks\'` manually'

function planHooksFile(current: string | null, force: boolean): HooksInitFile {
  const path = HOOKS_INIT_PATHS.hooks
  if (current === null) return { path, action: 'create', content: HOOKS_TEMPLATE }
  if (current === HOOKS_TEMPLATE) return { path, action: 'unchanged' }
  return force ? { path, action: 'update', content: HOOKS_TEMPLATE } : { path, action: 'skip', reason: DIFFERS_REASON }
}

function planWorkerWiring(current: string | null): HooksInitFile {
  const path = HOOKS_INIT_PATHS.worker
  if (current === null) return { path, action: 'skip', reason: MISSING_WORKER_REASON }
  if (/\bhooks\b/.test(current)) return { path, action: 'unchanged' }

  const match = current.match(STARTER_WORKER_RE)
  if (!match) return { path, action: 'skip', reason: CUSTOM_WORKER_REASON }

  const refLine = match[1] ?? ''
  const wired = `${refLine}import { createBeechApp } from '@beechcms/api'\nimport { hooks } from './hooks'\n\nexport default createBeechApp({ seeds: [], hooks })\n`
  return { path, action: 'update', content: wired }
}

/** Pure planner for `beech hooks init`. */
export function planHooksInit(input: HooksInitInput): HooksInitFile[] {
  return [
    planHooksFile(input.existing[HOOKS_INIT_PATHS.hooks] ?? null, input.force),
    planWorkerWiring(input.existing[HOOKS_INIT_PATHS.worker] ?? null),
  ]
}

function describeFile(file: HooksInitFile): string {
  switch (file.action) {
    case 'create': return pc.green(`  ✓ created   ${file.path}`)
    case 'update': return pc.cyan(`  ↻ updated   ${file.path}`)
    case 'unchanged': return pc.gray(`  = unchanged ${file.path}`)
    case 'skip': return pc.yellow(`  - skipped   ${file.path}: ${file.reason}`)
  }
}

/** `beech hooks init [--force]`, run from the project root. */
export async function hooksInit(options: HooksInitOptions = {}): Promise<void> {
  try {
    const cwd = process.cwd()
    const existing: Record<string, string | null> = {}
    for (const path of Object.values(HOOKS_INIT_PATHS)) {
      const absolute = resolve(cwd, path)
      existing[path] = existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
    }

    const plan = planHooksInit({ existing, force: options.force ?? false })

    console.log('')
    for (const file of plan) {
      if (file.content !== undefined) {
        const absolute = resolve(cwd, file.path)
        mkdirSync(dirname(absolute), { recursive: true })
        writeFileSync(absolute, file.content)
      }
      console.log(describeFile(file))
    }

    const workerPlan = plan.find(file => file.path === HOOKS_INIT_PATHS.worker)
    if (workerPlan?.action === 'skip') {
      console.log(pc.dim('\n  Wire hooks into your entrypoint:'))
      console.log(pc.cyan("    import { hooks } from './hooks'"))
      console.log(pc.cyan('    export default createBeechApp({ seeds: [], hooks })\n'))
    } else {
      console.log(pc.dim('\n  Edit hooks.ts and deploy/restart your Worker to activate.\n'))
    }
  } catch (error) {
    exitWithError(error)
  }
}
