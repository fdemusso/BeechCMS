// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeTemplateVersions } from './template-versions.mjs'

/**
 * The root manifest is two things at once: the monorepo's own (lifecycle scripts, dev tooling) and
 * the manifest of the published scaffolder. Only fields a consumer needs are carried over, so a
 * script added to the monorepo root can never reach a user's `npm install` (#1019: a `postinstall`
 * pointing at a file the tarball does not ship aborted every install).
 */
const PUBLISHED_FIELDS = [
  'name', 'version', 'description', 'keywords', 'author', 'license', 'homepage', 'repository', 'bugs',
  'type', 'engines', 'bin', 'files', 'dependencies',
]

/**
 * @param {Record<string, unknown>} manifest The root package.json.
 * @returns {Record<string, unknown>} The manifest that is published.
 */
export function sanitizeManifest(manifest) {
  const published = {}
  for (const field of PUBLISHED_FIELDS) {
    if (manifest[field] !== undefined) published[field] = manifest[field]
  }

  for (const [name, range] of Object.entries(published.dependencies ?? {})) {
    if (String(range).startsWith('workspace:')) {
      throw new Error(`Refusing to publish ${manifest.name}: dependency ${name} is a workspace range (${range}).`)
    }
  }
  return published
}

/**
 * Builds the directory @beechcms/cms is published from: the sanitized manifest, `bin/`, the
 * README and LICENSE, and the template versions the scaffolder pins.
 *
 * @param {string} repoRoot Root of the monorepo.
 * @returns {string} The staging directory (the caller removes it).
 */
export function stageScaffolder(repoRoot) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const stage = mkdtempSync(join(tmpdir(), 'beechcms-cms-'))

  writeFileSync(join(stage, 'package.json'), JSON.stringify(sanitizeManifest(manifest), null, 2) + '\n')
  cpSync(join(repoRoot, 'bin'), join(stage, 'bin'), { recursive: true })
  cpSync(join(repoRoot, 'README.md'), join(stage, 'README.md'))
  cpSync(join(repoRoot, 'LICENSE'), join(stage, 'LICENSE'))
  writeFileSync(
    join(stage, 'bin', 'template-versions.json'),
    JSON.stringify(computeTemplateVersions(repoRoot), null, 2) + '\n',
  )
  return stage
}
