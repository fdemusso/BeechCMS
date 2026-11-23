// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { EXAMPLE_SCRIPT_TEMPLATE, SCRIPTS_README_TEMPLATE, SKILL_TEMPLATE } from '../lib/agent-templates.js'
import { readCliVersion } from '../lib/cli-version.js'
import { CliError, exitWithError } from '../lib/d1-context.js'

export const AGENT_SETUP_PATHS = {
  mcpConfig: '.mcp.json',
  skill: '.claude/skills/beechcms-scripts/SKILL.md',
  readme: '.beech/scripts/README.md',
  example: '.beech/scripts/latest-entries.ts',
  packageJson: 'package.json',
} as const
export const MCP_SERVER_KEY = 'beechcms'

export type AgentSetupAction = 'create' | 'update' | 'unchanged' | 'skip'
export interface AgentSetupFile {
  /** One of AGENT_SETUP_PATHS, relative to the project root. */
  path: string
  action: AgentSetupAction
  /** Why a file was skipped. */
  reason?: string
  /** Full new content; present iff action is 'create' or 'update'. */
  content?: string
}
export interface AgentSetupInput {
  /** Current content of each AGENT_SETUP_PATHS entry; null when absent. */
  existing: Readonly<Record<string, string | null>>
  apiUrl: string
  /** Written as BEECH_AUTH_URL only when defined. */
  authUrl?: string
  cliVersion: string
  force: boolean
}
export interface AgentSetupOptions { force?: boolean; apiUrl?: string }

const DEFAULT_API_URL = 'http://localhost:8789'
const CLI_PACKAGE_NAME = '@beechcms/cli'
const DIFFERS_REASON = 'differs from the template; --force overwrites'
const MALFORMED_MCP_REASON = 'not valid JSON; left untouched'
const DIFFERENT_ENTRY_REASON = `existing "${MCP_SERVER_KEY}" entry differs; --force replaces it`

type JsonObject = Record<string, unknown>

const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n'

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as JsonObject) : null
  } catch {
    return null
  }
}

function planGeneratedFile(path: string, template: string, current: string | null, force: boolean): AgentSetupFile {
  if (current === null) return { path, action: 'create', content: template }
  if (current === template) return { path, action: 'unchanged' }
  return force ? { path, action: 'update', content: template } : { path, action: 'skip', reason: DIFFERS_REASON }
}

function planMcpConfig(input: AgentSetupInput): AgentSetupFile {
  const path = AGENT_SETUP_PATHS.mcpConfig
  const desiredEntry = {
    command: 'npx',
    args: ['-y', '@beechcms/mcp'],
    env: { BEECH_API_URL: input.apiUrl, ...(input.authUrl === undefined ? {} : { BEECH_AUTH_URL: input.authUrl }) },
  }
  const current = input.existing[path]
  if (current === null || current === undefined) {
    return { path, action: 'create', content: serialize({ mcpServers: { [MCP_SERVER_KEY]: desiredEntry } }) }
  }

  const config = parseJsonObject(current)
  const servers = config?.mcpServers
  if (config === null || (servers !== undefined && (typeof servers !== 'object' || servers === null || Array.isArray(servers)))) {
    return { path, action: 'skip', reason: MALFORMED_MCP_REASON }
  }

  const existingServers = (servers ?? {}) as JsonObject
  const existingEntry = existingServers[MCP_SERVER_KEY]
  if (existingEntry !== undefined && JSON.stringify(existingEntry) === JSON.stringify(desiredEntry)) return { path, action: 'unchanged' }
  if (existingEntry !== undefined && !input.force) return { path, action: 'skip', reason: DIFFERENT_ENTRY_REASON }

  const merged = { ...config, mcpServers: { ...existingServers, [MCP_SERVER_KEY]: desiredEntry } }
  return { path, action: 'update', content: serialize(merged) }
}

function planPackageJson(input: AgentSetupInput): AgentSetupFile {
  const path = AGENT_SETUP_PATHS.packageJson
  const current = input.existing[path]
  const manifest = current === null || current === undefined ? null : parseJsonObject(current)
  if (manifest === null) throw new CliError('Run beech agent setup from the project root (no package.json)')

  const declaresCli = (['dependencies', 'devDependencies'] as const).some(
    section => typeof manifest[section] === 'object' && manifest[section] !== null && CLI_PACKAGE_NAME in (manifest[section] as JsonObject),
  )
  if (declaresCli) return { path, action: 'unchanged' }

  const devDependencies = { ...(manifest.devDependencies as JsonObject | undefined), [CLI_PACKAGE_NAME]: `^${input.cliVersion}` }
  return { path, action: 'update', content: serialize({ ...manifest, devDependencies }) }
}

/** Pure: decides every file. Throws CliError when package.json is absent or not valid JSON. */
export function planAgentSetup(input: AgentSetupInput): AgentSetupFile[] {
  const { force, existing } = input
  return [
    planMcpConfig(input),
    planGeneratedFile(AGENT_SETUP_PATHS.skill, SKILL_TEMPLATE, existing[AGENT_SETUP_PATHS.skill] ?? null, force),
    planGeneratedFile(AGENT_SETUP_PATHS.readme, SCRIPTS_README_TEMPLATE, existing[AGENT_SETUP_PATHS.readme] ?? null, force),
    planGeneratedFile(AGENT_SETUP_PATHS.example, EXAMPLE_SCRIPT_TEMPLATE, existing[AGENT_SETUP_PATHS.example] ?? null, force),
    planPackageJson(input),
  ]
}

function describeFile(file: AgentSetupFile): string {
  switch (file.action) {
    case 'create': return pc.green(`  ✓ created   ${file.path}`)
    case 'update': return pc.cyan(`  ↻ updated   ${file.path}`)
    case 'unchanged': return pc.gray(`  = unchanged ${file.path}`)
    case 'skip': return pc.yellow(`  - skipped   ${file.path}: ${file.reason}`)
  }
}

/** `beech agent setup [--force] [--api-url <url>]`, run from the project root. */
export async function agentSetup(options: AgentSetupOptions = {}): Promise<void> {
  try {
    const cwd = process.cwd()
    const existing: Record<string, string | null> = {}
    for (const path of Object.values(AGENT_SETUP_PATHS)) {
      const absolute = resolve(cwd, path)
      existing[path] = existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
    }

    const plan = planAgentSetup({
      existing,
      apiUrl: options.apiUrl ?? process.env.BEECH_API_URL ?? DEFAULT_API_URL,
      authUrl: process.env.BEECH_AUTH_URL,
      cliVersion: readCliVersion(),
      force: options.force ?? false,
    })

    console.log('')
    for (const file of plan) {
      if (file.content !== undefined) {
        const absolute = resolve(cwd, file.path)
        mkdirSync(dirname(absolute), { recursive: true })
        writeFileSync(absolute, file.content)
      }
      console.log(describeFile(file))
    }

    console.log(pc.cyan('\n  Next steps'))
    if (plan.some(file => file.path === AGENT_SETUP_PATHS.packageJson && file.action === 'update')) {
      console.log('    1. Install dependencies (@beechcms/cli was added to devDependencies)')
    }
    console.log('    - Restart your agent so it loads .mcp.json')
    console.log('    - Try: pnpm beech run latest-entries --arg seed=<slug> --json\n')
  } catch (error) {
    exitWithError(error)
  }
}
