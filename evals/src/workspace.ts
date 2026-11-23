// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EVAL_API_URL } from './stack.ts'
import type { EvalVariant } from './types.ts'

export interface AgentWorkspace {
  dir: string              // agent cwd, under os.tmpdir()
  mcpConfigFile: string
  systemPromptFile: string
  tokenCacheFile: string
  remove(): void
}

const V1_PACKAGE = '@beechcms/mcp@1.2.0'

/**
 * Builds the per-run agent workspace outside the repo, so the agent loads no repo `CLAUDE.md`,
 * cannot browse repo source, and the token cache never sits next to project files.
 */
export function createWorkspace(repoRoot: string, variant: EvalVariant, _taskId: string): AgentWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'beech-eval-'))
  const dir = join(root, 'site')
  const mcpConfigFile = join(root, 'mcp.json')
  const systemPromptFile = join(root, 'skill.md')
  const tokenCacheFile = join(root, 'tokens.json')
  mkdirSync(dir)

  if (variant === 'v1') {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'eval-site', private: true, type: 'module' }, null, 2))
    // What 1.x docs told users: copy SKILL.md into the agent's rules.
    const skill = execFileSync('git', ['show', `${V1_PACKAGE}:packages/mcp/SKILL.md`], { cwd: repoRoot, encoding: 'utf8' })
    writeFileSync(systemPromptFile, skill)
  } else {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'eval-site',
      private: true,
      type: 'module',
      scripts: { beech: `node ${join(repoRoot, 'bin/cli.mjs')}` },
      // Declared so `agent setup` leaves package.json unchanged.
      devDependencies: { '@beechcms/cli': 'workspace' },
    }, null, 2))
    mkdirSync(join(dir, 'node_modules/@beechcms'), { recursive: true })
    symlinkSync(join(repoRoot, 'packages/cli'), join(dir, 'node_modules/@beechcms/cli'), 'dir')
    execFileSync('node', [join(repoRoot, 'bin/cli.mjs'), 'agent', 'setup', '--api-url', EVAL_API_URL], { cwd: dir, stdio: 'pipe' })
    copyFileSync(join(repoRoot, 'packages/mcp/SKILL.md'), systemPromptFile)
  }

  const server = variant === 'v1'
    ? { command: 'npx', args: ['-y', V1_PACKAGE, '--no-watch'] }
    : { command: 'node', args: [join(repoRoot, 'packages/mcp/dist/index.js'), '--no-watch'] }
  writeFileSync(mcpConfigFile, JSON.stringify({
    mcpServers: {
      beechcms: {
        ...server,
        // A missing grant fails in seconds instead of waiting minutes for a browser.
        env: { BEECH_API_URL: EVAL_API_URL, BEECH_TOKEN_CACHE: tokenCacheFile, BEECH_OAUTH_TIMEOUT_MS: '5000' },
      },
    },
  }, null, 2))

  return { dir, mcpConfigFile, systemPromptFile, tokenCacheFile, remove: () => rmSync(root, { recursive: true, force: true }) }
}
