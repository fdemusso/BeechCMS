// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CLI and Documentation Parity (Fact-Checking)', () => {
  const cliMjsPath = resolve(__dirname, '../../../../bin/cli.mjs')
  const docsPath = resolve(__dirname, '../../../../docs/build/cli-workflows.md')

  it('verifies bin/cli.mjs and cli-workflows.md exist', () => {
    expect(existsSync(cliMjsPath)).toBe(true)
    expect(existsSync(docsPath)).toBe(true)
  })

  it('ensures all registered CLI commands are documented in docs/build/cli-workflows.md', () => {
    const cliSource = readFileSync(cliMjsPath, 'utf-8')
    const docsContent = readFileSync(docsPath, 'utf-8')

    // Extract COMMANDS dictionary keys from bin/cli.mjs
    const commandsMatch = cliSource.match(/const COMMANDS = \{([\s\S]*?)\n\}/)
    expect(commandsMatch).not.toBeNull()

    const rawCommandLines = commandsMatch![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))

    const registeredCommands: string[] = []
    for (const line of rawCommandLines) {
      const match = line.match(/^['"]?([a-zA-Z0-9_:-]+)['"]?\s*:/)
      if (match) {
        registeredCommands.push(match[1])
      }
    }

    expect(registeredCommands.length).toBeGreaterThan(15)

    // Check that each command (or one of its known aliases) is present in the docs
    const aliasGroups: Record<string, string[]> = {
      forms: ['forms', 'form', 'forms:add'],
      'gen-types': ['gen-types', 'gen:types', 'generate:types', 'gen types typescript'],
      'setup:cloudflare': ['setup:cloudflare', 'setup:cf'],
      dev: ['dev', 'start'],
    }

    const checkedCommands = new Set<string>()

    for (const cmd of registeredCommands) {
      // Find which group this belongs to
      let foundGroup: string[] | null = null
      for (const [_, aliases] of Object.entries(aliasGroups)) {
        if (aliases.includes(cmd)) {
          foundGroup = aliases
          break
        }
      }

      if (foundGroup) {
        const groupKey = foundGroup.join('|')
        if (checkedCommands.has(groupKey)) continue
        checkedCommands.add(groupKey)

        const anyDocumented = foundGroup.some((alias) => docsContent.includes(`beech ${alias}`))
        expect(
          anyDocumented,
          `Expected at least one alias of [${foundGroup.join(', ')}] to be documented in cli-workflows.md`
        ).toBe(true)
      } else {
        expect(
          docsContent.includes(`beech ${cmd}`),
          `Command "beech ${cmd}" is defined in bin/cli.mjs but missing from docs/build/cli-workflows.md`
        ).toBe(true)
      }
    }
  })
})
