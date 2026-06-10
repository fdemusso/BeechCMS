import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { FALLBACK_ENDPOINTS, parseEndpoints } from '../endpoints'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

describe('parseEndpoints', () => {
  it('parses real routes from apps/api/src/factory.ts', () => {
    const endpoints = parseEndpoints(REPO_ROOT)

    expect(endpoints.length).toBeGreaterThan(0)
    expect(endpoints).not.toBe(FALLBACK_ENDPOINTS)

    const groups = new Set(endpoints.map((e) => e.group))
    expect(groups.has('Settings')).toBe(true)
    expect(groups.has('Schema')).toBe(true)

    // settingsApp is mounted at apiProtected.route('/settings', ...) and
    // apiProtected is mounted at app.route('/api', apiProtected).
    const settingsEndpoints = endpoints.filter((e) => e.group === 'Settings')
    expect(settingsEndpoints.length).toBeGreaterThan(0)
    for (const endpoint of settingsEndpoints) {
      expect(endpoint.path.startsWith('/api/settings')).toBe(true)
    }
  })

  it('falls back to the static endpoint list when factory.ts cannot be found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beech-dev-cli-endpoints-'))
    try {
      const endpoints = parseEndpoints(tmpDir)
      expect(endpoints).toEqual(FALLBACK_ENDPOINTS)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
