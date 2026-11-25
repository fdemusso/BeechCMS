// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { parseDevVars, upsertDevVars } from '../lib/dev-vars.js'

describe('parseDevVars', () => {
  it('returns the KEY=value pairs and ignores comments and blank lines', () => {
    const content = '# header\nJWT_SECRET=abc\n\n  # indented comment\nBEECH_SECRET_KEY=beech_sk_dev\nnot a pair\n'

    const entries = parseDevVars(content)

    expect(entries).toEqual({ JWT_SECRET: 'abc', BEECH_SECRET_KEY: 'beech_sk_dev' })
  })

  it('keeps = inside a value and strips one pair of surrounding quotes', () => {
    const content = 'A=x=y=z\nB="quoted value"\nC=\'single\'\nD="unbalanced\nE=  padded  \n'

    const entries = parseDevVars(content)

    expect(entries).toEqual({ A: 'x=y=z', B: 'quoted value', C: 'single', D: '"unbalanced', E: 'padded' })
  })

  it('parses CRLF content to the same record as LF content', () => {
    const lf = '# c\nA=1\nB=2\n'

    const crlf = parseDevVars(lf.replace(/\n/g, '\r\n'))

    expect(crlf).toEqual(parseDevVars(lf))
  })

  it('keeps the last value when a key appears twice', () => {
    const entries = parseDevVars('A=1\nA=2\n')

    expect(entries).toEqual({ A: '2' })
  })
})

describe('upsertDevVars', () => {
  it('replaces an existing key\'s value in place and keeps every other line byte for byte', () => {
    const content = '# keep me\nA=1\n  # odd   spacing\nB=2\n\nC=3\n'

    const result = upsertDevVars(content, { B: 'new' })

    expect(result).toBe('# keep me\nA=1\n  # odd   spacing\nB=new\n\nC=3\n')
  })

  it('appends missing keys after one blank line, in entries order', () => {
    const result = upsertDevVars('A=1\n', { Z: '26', B: '2' })

    expect(result).toBe('A=1\n\nZ=26\nB=2\n')
  })

  it('writes only the entries when the input is empty', () => {
    const result = upsertDevVars('', { A: '1' })

    expect(result).toBe('A=1\n')
  })

  it('keeps CRLF line endings when the input uses them', () => {
    const result = upsertDevVars('A=1\r\nB=2\r\n', { B: '9', C: '3' })

    expect(result).toBe('A=1\r\nB=9\r\n\r\nC=3\r\n')
  })

  it('an R2 upsert on a scaffolded .dev.vars keeps the auth secrets and the privacy key unchanged', () => {
    // Literal in the layout bin/template.mjs scaffolds: the CLI cannot import the scaffolder.
    const scaffolded = [
      '# This file is git-ignored and must never be committed.',
      'JWT_SECRET=' + 'a'.repeat(64),
      'BEECH_SECRET_KEY=beech_sk_dev',
      'PUBLIC_TIME_TRAP_SECRET=' + 'b'.repeat(64),
      '# Media uploads work locally without any configuration.',
      '# Master key for protected fields. Do NOT change once data is stored.',
      'PRIVACY_MASTER_KEY=' + 'c'.repeat(64),
      '',
    ].join('\n')

    // Regression guard: setup:cloudflare used to overwrite the whole file with the R2 block.
    const result = parseDevVars(upsertDevVars(scaffolded, {
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
      R2_BUCKET_NAME: 'media',
    }))

    expect(result).toMatchObject({
      JWT_SECRET: 'a'.repeat(64),
      BEECH_SECRET_KEY: 'beech_sk_dev',
      PUBLIC_TIME_TRAP_SECRET: 'b'.repeat(64),
      PRIVACY_MASTER_KEY: 'c'.repeat(64),
      R2_ACCESS_KEY_ID: 'id',
      R2_BUCKET_NAME: 'media',
    })
  })
})
