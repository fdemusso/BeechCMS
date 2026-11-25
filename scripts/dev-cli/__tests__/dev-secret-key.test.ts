// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureDevSecretKey } = await import('../orchestrator')

describe('ensureDevSecretKey', () => {
  // scripts/dev-cli has no integration tier: the function's whole contract is reading and writing a real .dev.vars file.
  let workdir: string
  let devVarsPath: string

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beech-dev-vars-'))
    fs.mkdirSync(path.join(workdir, 'apps', 'api'), { recursive: true })
    devVarsPath = path.join(workdir, 'apps', 'api', '.dev.vars')
    vi.spyOn(process, 'cwd').mockReturnValue(workdir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(workdir, { recursive: true, force: true })
  })

  it('appends the key when it is absent', () => {
    fs.writeFileSync(devVarsPath, 'ENV=development\n')

    const written = ensureDevSecretKey()

    expect(written).toBe(true)
    const content = fs.readFileSync(devVarsPath, 'utf8')
    expect(content.split('\n')).toContain('BEECH_SECRET_KEY=beech_sk_dev')
    expect(content.startsWith('ENV=development\n')).toBe(true)
  })

  it('replaces a blank value in place', () => {
    fs.writeFileSync(devVarsPath, 'ENV=development\nBEECH_SECRET_KEY=\nOTHER=1\n')

    const written = ensureDevSecretKey()

    expect(written).toBe(true)
    expect(fs.readFileSync(devVarsPath, 'utf8')).toBe('ENV=development\nBEECH_SECRET_KEY=beech_sk_dev\nOTHER=1\n')
  })

  it('leaves an existing value untouched', () => {
    const original = 'BEECH_SECRET_KEY=beech_sk_custom\n'
    fs.writeFileSync(devVarsPath, original)

    const written = ensureDevSecretKey()

    expect(written).toBe(false)
    expect(fs.readFileSync(devVarsPath, 'utf8')).toBe(original)
  })

  it('returns false when .dev.vars is missing', () => {
    const written = ensureDevSecretKey()

    expect(written).toBe(false)
    expect(fs.existsSync(devVarsPath)).toBe(false)
  })
})
