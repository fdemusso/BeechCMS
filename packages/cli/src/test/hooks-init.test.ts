// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { stripTypeScriptTypes } from 'node:module'
import { describe, expect, it } from 'vitest'
import { HOOKS_INIT_PATHS, HOOKS_TEMPLATE, planHooksInit, type HooksInitFile } from '../commands/hooks-init.js'

const STARTER_WORKER = `/// <reference types="@cloudflare/workers-types" />
import { createBeechApp } from '@beechcms/api'

export default createBeechApp({ seeds: [] })
`

describe('planHooksInit', () => {
  const fileAt = (plan: HooksInitFile[], path: string): HooksInitFile => plan.find(file => file.path === path)!

  it('creates hooks.ts and wires a clean starter worker.ts', () => {
    const plan = planHooksInit({
      existing: { [HOOKS_INIT_PATHS.hooks]: null, [HOOKS_INIT_PATHS.worker]: STARTER_WORKER },
      force: false,
    })

    expect(fileAt(plan, HOOKS_INIT_PATHS.hooks)).toEqual({ path: 'hooks.ts', action: 'create', content: HOOKS_TEMPLATE })
    const worker = fileAt(plan, HOOKS_INIT_PATHS.worker)
    expect(worker.action).toBe('update')
    expect(worker.content).toContain("import { hooks } from './hooks'")
    expect(worker.content).toContain('createBeechApp({ seeds: [], hooks })')
  })

  it('is idempotent on a second run over its own output', () => {
    const first = planHooksInit({
      existing: { [HOOKS_INIT_PATHS.hooks]: null, [HOOKS_INIT_PATHS.worker]: STARTER_WORKER },
      force: false,
    })
    const second = planHooksInit({
      existing: {
        [HOOKS_INIT_PATHS.hooks]: fileAt(first, HOOKS_INIT_PATHS.hooks).content ?? null,
        [HOOKS_INIT_PATHS.worker]: fileAt(first, HOOKS_INIT_PATHS.worker).content ?? null,
      },
      force: false,
    })

    expect(second.map(file => file.action)).toEqual(['unchanged', 'unchanged'])
  })

  it('skips customized hooks.ts without force and overwrites with force', () => {
    const existing = { [HOOKS_INIT_PATHS.hooks]: '// custom hooks\n', [HOOKS_INIT_PATHS.worker]: null }

    const withoutForce = planHooksInit({ existing, force: false })
    const withForce = planHooksInit({ existing, force: true })

    expect(fileAt(withoutForce, HOOKS_INIT_PATHS.hooks)).toMatchObject({ action: 'skip', reason: expect.stringContaining('--force') })
    expect(fileAt(withForce, HOOKS_INIT_PATHS.hooks)).toMatchObject({ action: 'update', content: HOOKS_TEMPLATE })
  })

  it('never overwrites a customized worker.ts or fails when worker.ts is missing', () => {
    const customWorker = "import { createBeechApp } from '@beechcms/api'\nexport default createBeechApp({ seeds: [], customRoutes: () => {} })\n"

    const customPlan = planHooksInit({ existing: { [HOOKS_INIT_PATHS.hooks]: null, [HOOKS_INIT_PATHS.worker]: customWorker }, force: true })
    const missingPlan = planHooksInit({ existing: { [HOOKS_INIT_PATHS.hooks]: null, [HOOKS_INIT_PATHS.worker]: null }, force: false })

    expect(fileAt(customPlan, HOOKS_INIT_PATHS.worker)).toMatchObject({ action: 'skip', reason: expect.stringContaining('customized') })
    expect(fileAt(missingPlan, HOOKS_INIT_PATHS.worker)).toMatchObject({ action: 'skip', reason: expect.stringContaining('not found') })
  })

  it('HOOKS_TEMPLATE survives TypeScript type stripping and imports HookValidationError', () => {
    const stripped = stripTypeScriptTypes(HOOKS_TEMPLATE)

    expect(stripped).toContain('HookValidationError')
    expect(stripped).toContain('export const hooks')
  })
})
