// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { legacyVarNames } from '../lib/key-model.js'

describe('legacyVarNames', () => {
  it('returns the four legacy names of a 0.10.x vars object in constant order', () => {
    const vars = {
      PUBLIC_TIME_TRAP_SECRET: 'd',
      APP_URL: 'http://localhost:5173',
      PUBLIC_WRITE_API_KEY: 'c',
      JWT_SECRET: 'a',
      PUBLIC_READ_API_KEY: 'b',
    }

    const result = legacyVarNames(vars)

    expect(result).toEqual(['PUBLIC_READ_API_KEY', 'PUBLIC_WRITE_API_KEY', 'JWT_SECRET', 'PUBLIC_TIME_TRAP_SECRET'])
  })

  it('ignores the new key names and unrelated names, and returns nothing for an empty object', () => {
    const migrated = { BEECH_PUBLISHABLE_KEY: 'beech_pk_dev', BEECH_SECRET_KEY: 'x', PRIVACY_MASTER_KEY: 'y', ENV: 'development' }

    const result = [legacyVarNames(migrated), legacyVarNames({})]

    expect(result).toEqual([[], []])
  })

  it('counts a legacy name whose value is an empty string', () => {
    const result = legacyVarNames({ JWT_SECRET: '' })

    expect(result).toEqual(['JWT_SECRET'])
  })
})
