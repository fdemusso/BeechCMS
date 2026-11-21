// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MCP_SERVER_VERSION } from './version.js'

describe('MCP_SERVER_VERSION', () => {
  it('MCP_SERVER_VERSION equals the package.json version', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

    expect(MCP_SERVER_VERSION).toBe(packageJson.version)
  })
})
