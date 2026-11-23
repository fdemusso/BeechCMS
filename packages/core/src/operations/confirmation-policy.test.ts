// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { agentEnvironment, requiresConfirmation } from './confirmation-policy.js'
import type { OperationRisk } from './types.js'

describe('requiresConfirmation', () => {
  it('requires confirmation for destructive in every environment and for publish only in production', () => {
    const risks: OperationRisk[] = ['read', 'write', 'publish', 'destructive']

    const matrix = risks.map(risk => [
      risk,
      requiresConfirmation(risk, 'development'),
      requiresConfirmation(risk, 'production'),
    ])

    expect(matrix).toEqual([
      ['read', false, false],
      ['write', false, false],
      ['publish', false, true],
      ['destructive', true, true],
    ])
  })
})

describe('agentEnvironment', () => {
  it('treats every ENV value other than production as development', () => {
    const inputs = [undefined, '', 'development', 'staging', 'Production', 'production']

    const environments = inputs.map(agentEnvironment)

    expect(environments).toEqual(['development', 'development', 'development', 'development', 'development', 'production'])
  })
})
