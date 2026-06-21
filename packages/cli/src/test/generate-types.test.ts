// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Seed } from '@beechcms/core'
import { generateTypes } from '../commands/generate-types.js'

const ARTICLES_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { alias: 'body', label: 'Body', type: 'richtext' },
  ],
} as Seed

const registry: Record<string, Seed> = { articles: ARTICLES_SEED }

const outPath = resolve(tmpdir(), `beech-test-${Date.now()}.ts`)

afterEach(() => {
  if (existsSync(outPath)) rmSync(outPath)
})

describe('generateTypes — local registry (injected)', () => {
  it('writes the output file', async () => {
    await generateTypes({ out: outPath, local: true, registry })
    expect(existsSync(outPath)).toBe(true)
  })

  it('output contains the interface', async () => {
    await generateTypes({ out: outPath, local: true, registry })
    const content = readFileSync(outPath, 'utf-8')
    expect(content).toContain('export interface Articles {')
  })

  it('output starts with the auto-generated banner', async () => {
    await generateTypes({ out: outPath, local: true, registry })
    const content = readFileSync(outPath, 'utf-8')
    expect(content).toContain('generato automaticamente')
  })

  it('output contains SeedRegistryTypes', async () => {
    await generateTypes({ out: outPath, local: true, registry })
    const content = readFileSync(outPath, 'utf-8')
    expect(content).toContain('export interface SeedRegistryTypes {')
  })

  it('exits with an error when registry is empty', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    await expect(generateTypes({ out: outPath, local: true, registry: {} })).rejects.toThrow('exit')
    exitSpy.mockRestore()
  })
})
