// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The dependency ranges the scaffolded project pins, read from the manifests that own them so
 * the template cannot drift from the packages it installs:
 * - `@beechcms/*` follow the version each package is released at,
 * - `wrangler` and `@cloudflare/workers-types` follow the ranges the API and CLI are built against
 *   (a wrangler/workers-types mismatch is an npm ERESOLVE on the first install).
 *
 * @param {string} repoRoot Root of the monorepo.
 * @returns {Record<string, string>}
 */
export function computeTemplateVersions(repoRoot) {
  const readManifest = (path) => JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8'))
  const api = readManifest('apps/api')
  const core = readManifest('packages/core')
  const cli = readManifest('packages/cli')

  const range = (manifest, name) => {
    const value = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
    if (!value) throw new Error(`${manifest.name} declares no ${name}`)
    return value
  }

  return {
    '@beechcms/api': `^${api.version}`,
    '@beechcms/core': `^${core.version}`,
    '@beechcms/cli': `^${cli.version}`,
    '@cloudflare/workers-types': range(api, '@cloudflare/workers-types'),
    wrangler: range(cli, 'wrangler'),
  }
}
