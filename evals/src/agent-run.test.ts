// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { claudeArgs, type AgentRunInput } from './agent-run.ts'

const input = (variant: 'v1' | 'v2'): AgentRunInput => ({
  variant,
  prompt: 'do the thing',
  model: 'sonnet',
  timeoutMs: 1_000,
  budgetUsd: 2,
  transcriptFile: '/tmp/run/t.jsonl',
  workspace: { dir: '/tmp/root/site', mcpConfigFile: '/tmp/root/mcp.json', systemPromptFile: '/tmp/root/skill.md', tokenCacheFile: '/tmp/root/tokens.json', remove: () => undefined },
})

const valueOf = (args: readonly string[], flag: string): string | undefined => args[args.indexOf(flag) + 1]

describe('claudeArgs', () => {
  it('v1 offers no built-in tools and auto-allows only the beechcms server', () => {
    const args = claudeArgs(input('v1'))

    expect(valueOf(args, '--tools')).toBe('')
    expect(valueOf(args, '--allowedTools')).toBe('mcp__beechcms')
  })

  it('v2 auto-allows Bash only for pnpm beech run', () => {
    const args = claudeArgs(input('v2'))

    const allowed = (valueOf(args, '--allowedTools') ?? '').split(',')
    expect(allowed).toContain('Bash(pnpm beech run:*)')
    expect(allowed).not.toContain('Bash')
    expect(valueOf(args, '--tools')).toBe('Bash,Read,Write,Edit,Glob,Grep,Skill')
  })

  it('both variants load only the eval MCP config and project settings', () => {
    const v1 = claudeArgs(input('v1'))
    const v2 = claudeArgs(input('v2'))

    for (const args of [v1, v2]) {
      expect(valueOf(args, '--mcp-config')).toBe('/tmp/root/mcp.json')
      expect(args).toContain('--strict-mcp-config')
      expect(valueOf(args, '--setting-sources')).toBe('project,local')
    }
  })
})
