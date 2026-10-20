// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../../..')
const OWN_PACKAGE_JSON = resolve(__dirname, '../../package.json')

function findWorkspacePackageJson(name: string): string | null {
  for (const group of ['packages', 'apps']) {
    const groupDir = resolve(REPO_ROOT, group)
    if (!existsSync(groupDir)) continue
    for (const dir of readdirSync(groupDir)) {
      const candidate = resolve(groupDir, dir, 'package.json')
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf-8')).name === name) {
        return candidate
      }
    }
  }
  return null
}

describe('@beechcms/cli published dependencies', () => {
  it('never lists a private, unpublished workspace package as a runtime dependency', () => {
    const pkg = JSON.parse(readFileSync(OWN_PACKAGE_JSON, 'utf-8'))
    const workspaceDeps = Object.entries(pkg.dependencies ?? {}).filter(
      ([, range]) => typeof range === 'string' && range.startsWith('workspace:')
    )

    for (const [depName] of workspaceDeps) {
      const depPackageJsonPath = findWorkspacePackageJson(depName)
      expect(depPackageJsonPath, `workspace package "${depName}" not found`).not.toBeNull()

      const depPkg = JSON.parse(readFileSync(depPackageJsonPath!, 'utf-8'))
      // pnpm strips devDependencies but keeps dependencies verbatim (converting `workspace:` to
      // a real semver range) when publishing, so a private dep here becomes an unresolvable
      // install for every consumer of @beechcms/cli.
      expect(
        depPkg.private,
        `"${depName}" is private (never published) but is a runtime dependency of @beechcms/cli`
      ).not.toBe(true)
    }
  })
})
