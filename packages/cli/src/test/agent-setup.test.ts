// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { stripTypeScriptTypes } from 'node:module'
import { describe, it, expect } from 'vitest'
import { AGENT_SETUP_PATHS, MCP_SERVER_KEY, planAgentSetup, type AgentSetupFile, type AgentSetupInput } from '../commands/agent-setup.js'
import { EXAMPLE_SCRIPT_TEMPLATE, SCRIPTS_README_TEMPLATE, SKILL_TEMPLATE } from '../lib/agent-templates.js'
import { CliError } from '../lib/d1-context.js'

const PACKAGE_JSON = JSON.stringify({ name: 'site', type: 'module', dependencies: { '@beechcms/api': '^0.10.0' } }, null, 2) + '\n'

describe('planAgentSetup', () => {
  function inputWith(existing: Record<string, string | null> = {}, overrides: Partial<AgentSetupInput> = {}): AgentSetupInput {
    return {
      existing: { [AGENT_SETUP_PATHS.packageJson]: PACKAGE_JSON, ...existing },
      apiUrl: 'http://localhost:8789',
      cliVersion: '0.10.0',
      force: false,
      ...overrides,
    }
  }

  const fileAt = (plan: AgentSetupFile[], path: string): AgentSetupFile => plan.find(file => file.path === path)!

  function applyPlan(input: AgentSetupInput, plan: AgentSetupFile[]): Record<string, string | null> {
    const next = { ...input.existing }
    for (const file of plan) if (file.content !== undefined) next[file.path] = file.content
    return next
  }

  it('an empty project gets every generated file created, .mcp.json created and @beechcms/cli added', () => {
    const plan = planAgentSetup(inputWith())

    expect(plan.map(file => [file.path, file.action])).toEqual([
      [AGENT_SETUP_PATHS.mcpConfig, 'create'],
      [AGENT_SETUP_PATHS.skill, 'create'],
      [AGENT_SETUP_PATHS.readme, 'create'],
      [AGENT_SETUP_PATHS.example, 'create'],
      [AGENT_SETUP_PATHS.packageJson, 'update'],
    ])
    expect(fileAt(plan, AGENT_SETUP_PATHS.skill).content).toBe(SKILL_TEMPLATE)
    expect(fileAt(plan, AGENT_SETUP_PATHS.readme).content).toBe(SCRIPTS_README_TEMPLATE)
    expect(JSON.parse(fileAt(plan, AGENT_SETUP_PATHS.mcpConfig).content!)).toEqual({
      mcpServers: { [MCP_SERVER_KEY]: { command: 'npx', args: ['-y', '@beechcms/mcp'], env: { BEECH_API_URL: 'http://localhost:8789' } } },
    })
    expect(JSON.parse(fileAt(plan, AGENT_SETUP_PATHS.packageJson).content!).devDependencies).toEqual({ '@beechcms/cli': '^0.10.0' })
  })

  it('a second run over its own output reports every file unchanged', () => {
    const firstInput = inputWith()
    const firstPlan = planAgentSetup(firstInput)

    const secondPlan = planAgentSetup(inputWith(applyPlan(firstInput, firstPlan)))

    expect(secondPlan.map(file => file.action)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged'])
  })

  it('a generated file that differs is skipped without force and updated with force', () => {
    const edited = { [AGENT_SETUP_PATHS.skill]: 'hand edited\n' }

    const withoutForce = planAgentSetup(inputWith(edited))
    const withForce = planAgentSetup(inputWith(edited, { force: true }))

    expect(fileAt(withoutForce, AGENT_SETUP_PATHS.skill)).toMatchObject({ action: 'skip', reason: expect.stringContaining('--force') })
    expect(fileAt(withoutForce, AGENT_SETUP_PATHS.skill).content).toBeUndefined()
    expect(fileAt(withForce, AGENT_SETUP_PATHS.skill)).toMatchObject({ action: 'update', content: SKILL_TEMPLATE })
  })

  it('an existing .mcp.json keeps its other servers when the beechcms entry is added', () => {
    const existingConfig = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } })

    const plan = planAgentSetup(inputWith({ [AGENT_SETUP_PATHS.mcpConfig]: existingConfig }))

    const mcp = fileAt(plan, AGENT_SETUP_PATHS.mcpConfig)
    expect(mcp.action).toBe('update')
    const written = JSON.parse(mcp.content!) as { theme: string; mcpServers: Record<string, unknown> }
    expect(written.theme).toBe('dark')
    expect(Object.keys(written.mcpServers)).toEqual(['other', MCP_SERVER_KEY])
  })

  it('a different beechcms entry is skipped without force and replaced with force, other keys untouched', () => {
    const handWritten = JSON.stringify({ theme: 'dark', mcpServers: { [MCP_SERVER_KEY]: { command: 'node', args: ['packages/mcp/dist/index.js'] }, other: { command: 'x' } } })
    const existing = { [AGENT_SETUP_PATHS.mcpConfig]: handWritten }

    const withoutForce = planAgentSetup(inputWith(existing))
    const withForce = planAgentSetup(inputWith(existing, { force: true }))

    expect(fileAt(withoutForce, AGENT_SETUP_PATHS.mcpConfig).action).toBe('skip')
    const replaced = fileAt(withForce, AGENT_SETUP_PATHS.mcpConfig)
    expect(replaced.action).toBe('update')
    const written = JSON.parse(replaced.content!) as { theme: string; mcpServers: Record<string, { command: string }> }
    expect(written.theme).toBe('dark')
    expect(written.mcpServers.other).toEqual({ command: 'x' })
    expect(written.mcpServers[MCP_SERVER_KEY].command).toBe('npx')
  })

  it('a malformed .mcp.json is skipped even with force', () => {
    const plan = planAgentSetup(inputWith({ [AGENT_SETUP_PATHS.mcpConfig]: '{ not json' }, { force: true }))

    expect(fileAt(plan, AGENT_SETUP_PATHS.mcpConfig)).toEqual({ path: AGENT_SETUP_PATHS.mcpConfig, action: 'skip', reason: 'not valid JSON; left untouched' })
  })

  it('an existing @beechcms/cli in dependencies or devDependencies, including workspace:, is left unchanged', () => {
    const manifests = [
      { dependencies: { '@beechcms/cli': '^0.9.0' } },
      { devDependencies: { '@beechcms/cli': 'workspace:^0.10.0' } },
    ]

    for (const manifest of manifests) {
      const plan = planAgentSetup(inputWith({ [AGENT_SETUP_PATHS.packageJson]: JSON.stringify(manifest) }))

      expect(fileAt(plan, AGENT_SETUP_PATHS.packageJson), JSON.stringify(manifest)).toEqual({ path: AGENT_SETUP_PATHS.packageJson, action: 'unchanged' })
    }
  })

  it('a missing package.json throws CliError', () => {
    const planWithoutManifest = () => planAgentSetup(inputWith({ [AGENT_SETUP_PATHS.packageJson]: null }))

    expect(planWithoutManifest).toThrow(CliError)
    expect(planWithoutManifest).toThrow('no package.json')
  })

  it('BEECH_AUTH_URL is written only when authUrl is given', () => {
    const withAuthUrl = planAgentSetup(inputWith({}, { authUrl: 'http://localhost:8788' }))
    const withoutAuthUrl = planAgentSetup(inputWith())

    const envOf = (plan: AgentSetupFile[]) => JSON.parse(fileAt(plan, AGENT_SETUP_PATHS.mcpConfig).content!).mcpServers[MCP_SERVER_KEY].env as Record<string, string>
    expect(envOf(withAuthUrl)).toEqual({ BEECH_API_URL: 'http://localhost:8789', BEECH_AUTH_URL: 'http://localhost:8788' })
    expect(envOf(withoutAuthUrl)).toEqual({ BEECH_API_URL: 'http://localhost:8789' })
  })

  it('the example script survives type stripping and imports defineScript from @beechcms/cli/sdk', () => {
    const stripped = stripTypeScriptTypes(EXAMPLE_SCRIPT_TEMPLATE)

    expect(stripped).toContain("import { defineScript } from '@beechcms/cli/sdk'")
    expect(stripped).toContain('export default defineScript(')
  })
})
