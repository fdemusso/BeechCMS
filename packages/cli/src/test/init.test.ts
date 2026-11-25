// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { keyReportLines } from '../commands/init.js'

const SECRET_KEY = 'beech_sk_live_' + '0123456789abcdef0123456789abcdef'

describe('keyReportLines', () => {
  it('reports the publishable key from vars in full', () => {
    const lines = keyReportLines({ wranglerVars: { BEECH_PUBLISHABLE_KEY: 'beech_pk_dev' }, devVars: null })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('beech_pk_dev')
  })

  it('reports a secret key in .dev.vars as set without printing any part of the value', () => {
    const lines = keyReportLines({
      wranglerVars: { BEECH_PUBLISHABLE_KEY: 'beech_pk_dev' },
      devVars: { BEECH_SECRET_KEY: SECRET_KEY },
    })

    expect(lines.some((line) => line.includes('BEECH_SECRET_KEY = set in .dev.vars'))).toBe(true)
    // A partial mask (first or last characters) would leak a run of the secret.
    for (const run of [SECRET_KEY, SECRET_KEY.slice(0, 8), SECRET_KEY.slice(-8), '0123456789abcdef']) {
      expect(lines.join('\n')).not.toContain(run)
    }
  })

  it('reports a missing or blank secret key in .dev.vars as missing', () => {
    const wranglerVars = { BEECH_PUBLISHABLE_KEY: 'beech_pk_dev' }

    const blank = keyReportLines({ wranglerVars, devVars: { BEECH_SECRET_KEY: '  ' } })
    const absent = keyReportLines({ wranglerVars, devVars: {} })

    expect(blank).toContain('BEECH_SECRET_KEY = missing from .dev.vars: writes answer 403')
    expect(absent).toEqual(blank)
  })

  it('never prints a BEECH_SECRET_KEY placed in wrangler vars', () => {
    const lines = keyReportLines({
      wranglerVars: { BEECH_PUBLISHABLE_KEY: 'beech_pk_dev', BEECH_SECRET_KEY: SECRET_KEY },
      devVars: null,
    })

    expect(lines.join('\n')).not.toContain(SECRET_KEY)
    expect(lines.join('\n')).not.toContain('BEECH_SECRET_KEY')
  })

  it('returns no lines when no new-model key exists anywhere', () => {
    const lines = keyReportLines({
      wranglerVars: { PUBLIC_READ_API_KEY: 'legacy' },
      devVars: { JWT_SECRET: 'x' },
    })

    expect(lines).toEqual([])
  })
})
