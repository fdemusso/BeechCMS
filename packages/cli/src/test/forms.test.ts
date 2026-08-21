// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { forms } from '../commands/forms.js'
import * as fs from 'node:fs'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
}))

vi.mock('picocolors', () => ({
  default: {
    bgCyan: (s: string) => s,
    black: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    bold: (s: string) => s,
  },
}))

describe('forms command (multi-framework generator)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates React form component in src/components/BeechForm.tsx', async () => {
    await forms({ framework: 'react', seed: 'clienti', mode: 'styled', yes: true })

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('src/components'), { recursive: true })
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('src/components/BeechForm.tsx'),
      expect.stringContaining("export function BeechForm"),
      'utf-8'
    )
  })

  it('generates Vue 3 form component in src/components/BeechForm.vue', async () => {
    await forms({ framework: 'vue', seed: 'leads', mode: 'styled', yes: true })

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('src/components/BeechForm.vue'),
      expect.stringContaining("<script setup lang=\"ts\">"),
      'utf-8'
    )
  })

  it('generates Svelte 5 form component in src/components/BeechForm.svelte', async () => {
    await forms({ framework: 'svelte', seed: 'contatti', mode: 'headless', yes: true })

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('src/components/BeechForm.svelte'),
      expect.stringContaining("$state"),
      'utf-8'
    )
  })

  it('generates Vanilla JS Web Component in src/components/BeechForm.js', async () => {
    await forms({ framework: 'vanilla', seed: 'newsletter', yes: true })

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('src/components/BeechForm.js'),
      expect.stringContaining("customElements.define('beech-form'"),
      'utf-8'
    )
  })
})
