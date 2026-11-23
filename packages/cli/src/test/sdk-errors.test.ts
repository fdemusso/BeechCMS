// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { BeechSdkError } from '../sdk/errors.js'

describe('BeechSdkError', () => {
  it('an object carrying the registered brand is instanceof BeechSdkError, so errors from another bundle match', () => {
    const foreignError = Object.assign(new Error('boom'), { [Symbol.for('beechcms.sdk.error')]: true })

    const matches = foreignError instanceof BeechSdkError

    expect(matches).toBe(true)
  })

  it('a plain Error with name BeechSdkError is not an instance', () => {
    const lookalike = Object.assign(new Error('boom'), { name: 'BeechSdkError' })

    const matches = lookalike instanceof BeechSdkError

    expect(matches).toBe(false)
  })

  it('the brand is not enumerable, so JSON output of an error is unchanged', () => {
    const error = new BeechSdkError('failed', 404, 'not_found', 'content.get', null)

    const serialized = JSON.parse(JSON.stringify(error)) as Record<string, unknown>

    expect(Object.getOwnPropertySymbols(error)).toContain(Symbol.for('beechcms.sdk.error'))
    expect(serialized).toEqual({ name: 'BeechSdkError', status: 404, code: 'not_found', operationId: 'content.get', body: null })
  })
})
