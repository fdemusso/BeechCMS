// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { generateTotpCode, totpStepAt, WebCryptoTotpProvider } from './totp.js'

// RFC 6238 Appendix B SHA-1 seed "12345678901234567890" in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('generateTotpCode', () => {
  it('matches the RFC 6238 SHA-1 vectors truncated to 6 digits', async () => {
    // The RFC lists 8-digit values; the 6-digit codes are their last six digits.
    const vectors = [
      { unixSeconds: 59, code: '287082' },
      { unixSeconds: 1111111109, code: '081804' },
      { unixSeconds: 1111111111, code: '050471' },
      { unixSeconds: 1234567890, code: '005924' },
      { unixSeconds: 2000000000, code: '279037' },
      // Step number exceeds 2^32 only here: guards the high word of the counter.
      { unixSeconds: 20000000000, code: '353130' },
    ]

    const codes = await Promise.all(vectors.map(({ unixSeconds }) => generateTotpCode(RFC_SECRET, totpStepAt(unixSeconds))))

    expect(codes).toEqual(vectors.map(({ code }) => code))
  })
})

describe('WebCryptoTotpProvider', () => {
  const provider = new WebCryptoTotpProvider()

  it('accepts the code of the current step and returns that step', async () => {
    const result = await provider.verify(RFC_SECRET, '081804', 1111111109)

    expect(result).toBe(totpStepAt(1111111109))
  })

  it('accepts the codes of the previous and the next step', async () => {
    // Code 287082 belongs to step 1 (T = 59); step 2 starts at 60 s, step 0 ends at 29 s.
    const cases = [
      { unixSeconds: 89, expectedStep: 1 },
      { unixSeconds: 29, expectedStep: 1 },
    ]

    const results = await Promise.all(cases.map(({ unixSeconds }) => provider.verify(RFC_SECRET, '287082', unixSeconds)))

    expect(results).toEqual(cases.map(({ expectedStep }) => expectedStep))
  })

  it('rejects a code two steps away', async () => {
    const result = await provider.verify(RFC_SECRET, '287082', 119)

    expect(result).toBeNull()
  })

  it('rejects codes that are not exactly six digits', async () => {
    const malformedCodes = ['12345', '1234567', '12a456', '', ' 287082']

    const results = await Promise.all(malformedCodes.map(code => provider.verify(RFC_SECRET, code, 59)))

    expect(results).toEqual(malformedCodes.map(() => null))
  })

  it('generates a 32-character base32 secret that differs between calls', () => {
    const first = provider.generateSecret()
    const second = provider.generateSecret()

    expect(first).toMatch(/^[A-Z2-7]{32}$/)
    expect(second).not.toBe(first)
  })

  it('builds an otpauth URI with encoded issuer and account and the SHA1/6/30 parameters', () => {
    const uri = provider.buildUri({ issuer: 'Beech CMS', accountName: 'ada@example.com', secret: RFC_SECRET })

    expect(uri).toBe(
      `otpauth://totp/Beech%20CMS:ada%40example.com?secret=${RFC_SECRET}&issuer=Beech%20CMS&algorithm=SHA1&digits=6&period=30`,
    )
  })
})
