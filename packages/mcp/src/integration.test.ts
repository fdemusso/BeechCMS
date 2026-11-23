// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Seed } from '@beechcms/core'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { writeGrant } from '@beechcms/api-client'
import { MCP_OAUTH_SCOPE } from './constants.js'
import { MCP_SERVER_VERSION } from './version.js'

const PENDING_INTENT_ID = '3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b'

interface ToolPayload {
  content: { type: string; text: string }[]
  isError?: boolean
}

interface ConfirmPayload {
  status: string
  reason: string | null
  results: { id: string; outcome: string }[]
}

describe('MCP Server Integration & Operational Test', () => {
  let server: http.Server
  let apiUrl: string
  let client: Client
  let transport: StdioClientTransport
  let tokenCacheDir: string
  let tokenCachePath: string
  let approveCalls = 0

  let registryVersion = 3
  const activeSeeds: Seed[] = [
    {
      slug: 'articles',
      label: 'Article',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
      ],
    },
  ]

  const seedRecords = [
    {
      slug: 'articles',
      definition: activeSeeds[0],
      status: 'active',
      source: 'runtime',
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 1000,
    },
  ]

  beforeAll(async () => {
    // 1. Start mock BeechCMS API server
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`)
      let body = ''
      for await (const chunk of req) body += chunk
      const parsedBody = body ? JSON.parse(body) : null

      // Protect /api/
      if (url.pathname.startsWith('/api/')) {
        const auth = req.headers.authorization
        if (!auth || auth !== 'Bearer test-valid-jwt') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 401, title: 'Unauthorized', detail: 'Invalid or missing token' }))
          return
        }
      }

      if (url.pathname === `/api/agent/intents/${PENDING_INTENT_ID}` && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent: {
            id: PENDING_INTENT_ID,
            operationId: 'seeds.delete',
            risk: 'destructive',
            summary: 'Delete a seed: DELETE /api/seeds/articles',
            status: 'pending',
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            body: null,
          },
        }))
        return
      }

      if (url.pathname === `/api/agent/intents/${PENDING_INTENT_ID}/approve` && req.method === 'POST') {
        approveCalls++
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          intent: { id: PENDING_INTENT_ID, status: 'executed' },
          result: { status: 200, body: { success: true } },
        }))
        return
      }

      if (url.pathname === '/api/seeds' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Schema-Version': String(registryVersion),
        })
        res.end(JSON.stringify(seedRecords))
        return
      }

      if (url.pathname.startsWith('/api/seeds/') && req.method === 'GET') {
        const slug = url.pathname.replace('/api/seeds/', '')
        const found = seedRecords.find(s => s.slug === slug)
        if (found) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(found))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 404, title: 'Not Found', detail: `No seed with slug '${slug}'` }))
        }
        return
      }

      if (url.pathname === '/api/schema' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(activeSeeds))
        return
      }

      if (url.pathname.endsWith('/mcp-plan') && req.method === 'POST') {
        const slug = url.pathname.split('/')[3]
        const candidate = parsedBody.candidate

        const isDestructive = candidate.branches && candidate.branches.length < 2
        if (isDestructive) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              slug,
              classification: 'destructive',
              requiresConfirmation: true,
              applicable: false,
              blockedReasons: ['Branch content would be dropped'],
              statements: ['ALTER TABLE content_articles DROP COLUMN content'],
              ftsRebuildNeeded: false,
              expectedVersion: registryVersion,
              issues: [],
            })
          )
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            slug,
            classification: 'additive',
            requiresConfirmation: false,
            applicable: true,
            blockedReasons: [],
            statements: ['ALTER TABLE content_articles ADD COLUMN summary TEXT'],
            ftsRebuildNeeded: false,
            expectedVersion: registryVersion,
            issues: [],
          })
        )
        return
      }

      if (url.pathname.endsWith('/mcp-apply') && req.method === 'POST') {
        const { expectedVersion } = parsedBody
        const slug = url.pathname.split('/')[3]

        if (expectedVersion !== registryVersion) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 409,
              title: 'Conflict',
              detail: `Registry version mismatch: planned against ${expectedVersion}, database is at ${registryVersion}.`,
            })
          )
          return
        }

        registryVersion++
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            slug,
            newVersion: registryVersion,
            ftsRebuilt: false,
          })
        )
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 404, title: 'Not Found' }))
    })

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as { port: number }
    apiUrl = `http://127.0.0.1:${address.port}`

    // Pre-seed the token cache so the subprocess finds a valid grant on its
    // first request instead of opening a browser for the OAuth flow.
    tokenCacheDir = mkdtempSync(join(tmpdir(), 'beech-mcp-integration-'))
    tokenCachePath = join(tokenCacheDir, 'mcp-tokens.json')
    process.env.BEECH_TOKEN_CACHE = tokenCachePath
    writeGrant(apiUrl, 'beech-mcp', {
      accessToken: 'test-valid-jwt',
      refreshToken: 'test-refresh-token',
      scope: MCP_OAUTH_SCOPE,
      expiresAt: Date.now() + 3_600_000,
    })

    const mcpIndexPath = resolve(__dirname, '../dist/index.js')
    transport = new StdioClientTransport({
      command: 'node',
      args: [mcpIndexPath],
      env: {
        ...process.env,
        BEECH_API_URL: apiUrl,
        BEECH_TOKEN_CACHE: tokenCachePath,
      },
    })

    client = new Client({ name: 'integration-test-client', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
  })

  afterAll(async () => {
    await client?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    delete process.env.BEECH_TOKEN_CACHE
    rmSync(tokenCacheDir, { recursive: true, force: true })
  })

  it('lists all registered BeechCMS MCP tools', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map(t => t.name).sort()
    expect(names).toEqual([
      'beech_confirm',
      'beech_docs_search',
      'beech_get_seed',
      'beech_intents',
      'beech_list_seeds',
      'beech_mcp_reload',
      'beech_mcp_status',
      'beech_schema_apply',
      'beech_schema_export',
      'beech_schema_plan',
      'beech_schema_validate',
      'beech_search',
      'beech_whoami',
    ])
  })

  it('beech_mcp_status returns server status and bundle hash', async () => {
    const res = (await client.callTool({ name: 'beech_mcp_status', arguments: {} })) as any
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.name).toBe('beechcms-mcp')
    expect(parsed.version).toBe(MCP_SERVER_VERSION)
    expect(typeof parsed.pid).toBe('number')
    expect(typeof parsed.bundleHash).toBe('string')
    expect(typeof parsed.resourceCount).toBe('number')
  })

  it('beech_mcp_reload refreshes cache and returns success payload', async () => {
    const res = (await client.callTool({ name: 'beech_mcp_reload', arguments: {} })) as any
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.reloaded).toBe(true)
    expect(typeof parsed.bundleHash).toBe('string')
    expect(typeof parsed.resourceCount).toBe('number')
  })

  it('beech_list_seeds returns seed summaries and parsed X-Schema-Version', async () => {
    const res = (await client.callTool({ name: 'beech_list_seeds', arguments: {} })) as any
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.seeds).toEqual([
      {
        slug: 'articles',
        label: 'Article',
        status: 'active',
        branchCount: 2,
        updatedAt: expect.any(Number),
      },
    ])
  })

  it('beech_get_seed returns the full seed record', async () => {
    const res = (await client.callTool({ name: 'beech_get_seed', arguments: { slug: 'articles' } })) as any
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.slug).toBe('articles')
    expect(parsed.definition.label).toBe('Article')
  })

  it('beech_get_seed returns an error result for nonexistent seed', async () => {
    const res = (await client.callTool({ name: 'beech_get_seed', arguments: { slug: 'unknown' } })) as any
    expect(res.isError).toBe(true)
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.error).toBe("No seed with slug 'unknown'")
  })

  it('beech_schema_export returns the active schema array', async () => {
    const res = (await client.callTool({ name: 'beech_schema_export', arguments: {} })) as any
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].slug).toBe('articles')
  })

  it('beech_schema_validate evaluates candidate definitions using core rules', async () => {
    // Valid candidate: omitting id on new branch and omitting displayNameAlias (inferred from first text branch)
    const validCandidate = {
      slug: 'articles',
      label: 'Articles',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
        { alias: 'summary', label: 'Summary', type: 'text' },
      ],
    }
    const validRes = (await client.callTool({
      name: 'beech_schema_validate',
      arguments: { candidate: validCandidate },
    })) as any
    expect(validRes.isError).toBeFalsy()
    const validParsed = JSON.parse(validRes.content[0].text)
    expect(validParsed.issues).toEqual([])

    // Invalid candidate: collision with reserved system column 'id'
    const invalidCandidate = {
      slug: 'articles',
      label: 'Articles',
      branches: [
        { alias: 'id', label: 'Collision', type: 'text' },
      ],
    }
    const invalidRes = (await client.callTool({
      name: 'beech_schema_validate',
      arguments: { candidate: invalidCandidate },
    })) as any
    const invalidParsed = JSON.parse(invalidRes.content[0].text)
    expect(invalidParsed.issues.length).toBeGreaterThan(0)
    expect(invalidParsed.issues.some((i: any) => i.fatal && i.messages.some((m: string) => m.includes('reserved system column')))).toBe(true)

    // Invalid candidate: invalid slug format (#394)
    const invalidSlugCandidate = {
      slug: 'Test-Slug Con Spazi',
      label: 'X',
      displayNameAlias: 'nome',
      branches: [{ alias: 'nome', label: 'Nome', type: 'text' }],
    }
    const invalidSlugRes = (await client.callTool({
      name: 'beech_schema_validate',
      arguments: { candidate: invalidSlugCandidate },
    })) as any
    const invalidSlugParsed = JSON.parse(invalidSlugRes.content[0].text)
    expect(invalidSlugParsed.issues.length).toBeGreaterThan(0)
    expect(invalidSlugParsed.issues.some((i: any) => i.fatal && i.messages.some((m: string) => m.includes('slug')))).toBe(true)
  })

  it('beech_schema_validate warns, without blocking, about a dashboard.icon outside the dashboard icon set', async () => {
    const candidate = {
      slug: 'articles',
      label: 'Articles',
      dashboard: { icon: 'Cars' },
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
      ],
    }

    const res = (await client.callTool({ name: 'beech_schema_validate', arguments: { candidate } })) as { isError?: boolean; content: Array<{ text: string }> }

    expect(res.isError).toBeFalsy()
    const { issues } = JSON.parse(res.content[0].text) as { issues: Array<{ fatal: boolean; messages: string[] }> }
    expect(issues).toHaveLength(1)
    expect(issues[0].fatal).toBe(false)
    expect(issues[0].messages[0]).toContain('Closest: Car')
  })

  it('performs full plan -> apply lifecycle for additive change', async () => {
    const candidate = {
      slug: 'articles',
      label: 'Articles',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
        { alias: 'summary', label: 'Summary', type: 'text' },
      ],
    }

    // 1. Plan
    const planRes = (await client.callTool({
      name: 'beech_schema_plan',
      arguments: { slug: 'articles', candidate },
    })) as any
    expect(planRes.isError).toBeFalsy()
    const plan = JSON.parse(planRes.content[0].text)
    expect(plan.planId).toBeDefined()
    expect(plan.classification).toBe('additive')
    expect(plan.expiresInSeconds).toBe(600)

    // 2. Apply
    const applyRes = (await client.callTool({
      name: 'beech_schema_apply',
      arguments: { planId: plan.planId },
    })) as any
    expect(applyRes.isError).toBeFalsy()
    const applied = JSON.parse(applyRes.content[0].text)
    expect(applied.slug).toBe('articles')
    expect(applied.newVersion).toBe(4)

    // 3. Single-use: Reapplying the same planId must fail
    const replayRes = (await client.callTool({
      name: 'beech_schema_apply',
      arguments: { planId: plan.planId },
    })) as any
    expect(replayRes.isError).toBe(true)
    const replayParsed = JSON.parse(replayRes.content[0].text)
    expect(replayParsed.error).toContain('Unknown planId')
  })

  it('prevents apply of destructive plans', async () => {
    const destructiveCandidate = {
      slug: 'articles',
      label: 'Articles',
      branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
    }

    const planRes = (await client.callTool({
      name: 'beech_schema_plan',
      arguments: { slug: 'articles', candidate: destructiveCandidate },
    })) as any
    const plan = JSON.parse(planRes.content[0].text)
    expect(plan.classification).toBe('destructive')

    const applyRes = (await client.callTool({
      name: 'beech_schema_apply',
      arguments: { planId: plan.planId },
    })) as any
    expect(applyRes.isError).toBe(true)
    const applyParsed = JSON.parse(applyRes.content[0].text)
    expect(applyParsed.error).toContain("classified 'destructive'")
  })

  it('handles schema drift (HTTP 409) with helpful recovery message', async () => {
    const candidate = {
      slug: 'articles',
      label: 'Articles',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
      ],
    }

    const planRes = (await client.callTool({
      name: 'beech_schema_plan',
      arguments: { slug: 'articles', candidate },
    })) as any
    const plan = JSON.parse(planRes.content[0].text)

    // Bump server version behind the scenes
    registryVersion = 999

    const applyRes = (await client.callTool({
      name: 'beech_schema_apply',
      arguments: { planId: plan.planId },
    })) as any
    expect(applyRes.isError).toBe(true)
    const applyParsed = JSON.parse(applyRes.content[0].text)
    expect(applyParsed.error).toContain('Registry version mismatch')
    expect(applyParsed.error).toContain('Re-run beech_schema_plan; the previous plan has been discarded.')
  })

  it('beech_confirm without elicitation support returns the dashboard fallback', async () => {
    approveCalls = 0

    const res = (await client.callTool({ name: 'beech_confirm', arguments: { intentIds: [PENDING_INTENT_ID] } })) as ToolPayload

    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text) as ConfirmPayload
    expect(parsed.status).toBe('fallback')
    expect(parsed.reason).toBe('elicitation_unsupported')
    expect(approveCalls).toBe(0)
  })

  it('beech_confirm round-trips an elicitation through the supervisor and approves', async () => {
    approveCalls = 0
    const elicitingClient = new Client(
      { name: 'eliciting-test-client', version: '1.0.0' },
      { capabilities: { elicitation: {} } },
    )
    elicitingClient.setRequestHandler(ElicitRequestSchema, async () => ({
      action: 'accept',
      content: { decision: 'approve' },
    }))
    const elicitingTransport = new StdioClientTransport({
      command: 'node',
      args: [resolve(__dirname, '../dist/index.js')],
      env: { ...process.env, BEECH_API_URL: apiUrl, BEECH_TOKEN_CACHE: tokenCachePath },
    })
    await elicitingClient.connect(elicitingTransport)

    try {
      const res = (await elicitingClient.callTool({ name: 'beech_confirm', arguments: { intentIds: [PENDING_INTENT_ID] } })) as ToolPayload

      expect(res.isError).toBeFalsy()
      const parsed = JSON.parse(res.content[0].text) as ConfirmPayload
      expect(parsed.status).toBe('decided')
      expect(parsed.results).toMatchObject([{ id: PENDING_INTENT_ID, outcome: 'executed' }])
      expect(approveCalls).toBe(1)
    } finally {
      await elicitingClient.close()
    }
  })

  it('tools carry annotations and beech_confirm is the only destructive one', async () => {
    const { tools } = await client.listTools()

    const withoutAnnotations = tools.filter(tool => tool.annotations === undefined).map(tool => tool.name)
    const destructive = tools.filter(tool => tool.annotations?.destructiveHint === true).map(tool => tool.name)

    expect(withoutAnnotations).toEqual([])
    expect(destructive).toEqual(['beech_confirm'])
  })
})
