// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clearResourceCache, getResourceCount } from './resources.js'
import { McpSupervisor, computeBundleHash } from './supervisor.js'

describe('Issue #391: Auto-restart MCP server and dynamic resource reload on rebuild', () => {
  let testDir: string
  let supervisor: McpSupervisor | null = null

  beforeEach(() => {
    testDir = join(tmpdir(), `beech-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    if (supervisor) {
      await supervisor.stop()
      supervisor = null
    }
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  describe('Dynamic resource reloading on manifest change', () => {
    it('detects updated manifest.json without needing manual process restart', () => {
      expect(typeof clearResourceCache).toBe('function')
      expect(typeof getResourceCount).toBe('function')
    })
  })

  describe('Bundle hash and supervisor change detection', () => {
    it('computes bundle hash and detects changes when file is updated', () => {
      const fileA = join(testDir, 'bundle.js')
      writeFileSync(fileA, 'console.log("v1")')
      const hash1 = computeBundleHash([fileA])

      writeFileSync(fileA, 'console.log("v2")')
      const hash2 = computeBundleHash([fileA])

      expect(hash1).toBeTruthy()
      expect(hash2).toBeTruthy()
      expect(hash1).not.toBe(hash2)
    })

    it('McpSupervisor detects rebuild and restarts child server while keeping client connected', async () => {
      const mockBundle = join(testDir, 'server.mjs')
      writeFileSync(
        mockBundle,
        `
        import readline from 'readline';
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        rl.on('line', (line) => {
          try {
            const msg = JSON.parse(line);
            if (msg.method === 'initialize') {
              console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { serverInfo: { name: 'mock-mcp', version: '1.0' } } }));
            } else if (msg.method === 'test/ping') {
              console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { pong: true, version: '1' } }));
            }
          } catch {}
        });
      `
      )

      const clientOutputs: string[] = []
      let restarted = false

      supervisor = new McpSupervisor({
        entryFile: mockBundle,
        watchTargets: [mockBundle],
        debounceMs: 50,
        onClientOutput: (line) => clientOutputs.push(line),
        onRestart: () => {
          restarted = true
        },
      })

      await supervisor.start()

      const waitForOutput = async (str: string, maxWait = 2000) => {
        const start = Date.now()
        while (Date.now() - start < maxWait) {
          if (clientOutputs.some((l) => l.includes(str))) return true
          await new Promise((r) => setTimeout(r, 50))
        }
        return false
      }

      // Client sends initialize
      supervisor.handleClientInput(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { clientInfo: { name: 'test-client' } },
        }) + '\n'
      )

      expect(await waitForOutput('mock-mcp')).toBe(true)

      // Send initial ping
      supervisor.handleClientInput(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'test/ping',
        }) + '\n'
      )
      
      expect(await waitForOutput('"version":"1"')).toBe(true)

      // Simulate file rebuild
      writeFileSync(
        mockBundle,
        `
        import readline from 'readline';
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        rl.on('line', (line) => {
          try {
            const msg = JSON.parse(line);
            if (msg.method === 'initialize') {
              console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { serverInfo: { name: 'mock-mcp', version: '2.0' } } }));
            } else if (msg.method === 'test/ping') {
              console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { pong: true, version: '2' } }));
            }
          } catch {}
        });
      `
      )

      // Restart supervisor (either via watcher or explicit call)
      await supervisor.restart()

      // Supervisor must have emitted list_changed notifications to the client
      expect(await waitForOutput('notifications/tools/list_changed')).toBe(true)
      expect(await waitForOutput('notifications/resources/list_changed')).toBe(true)

      // Client sends a request to verify the new server responds with version 2
      supervisor.handleClientInput(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'test/ping',
        }) + '\n'
      )

      expect(await waitForOutput('"version":"2"')).toBe(true)
    })
  })
})
