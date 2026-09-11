// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/** Slice-shaped shared libraries: importable from inside any slice (feature -> shared lib). */
const SHARED_SLICES = new Set(['shared'])

const TEST_FILE = /\.test\.tsx?$/
const E2E_FILE = /\.e2e\.tsx?$/
const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

/** Tracked files only: an untracked scratch test must not fail a teammate's commit. */
function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => TEST_FILE.test(file) || E2E_FILE.test(file))
}

/** Returns the slice name when `file` lives inside a feature slice of `app`, else null. */
function sliceOf(file, app) {
  const prefix = `apps/${app}/src/features/`
  if (!file.startsWith(prefix)) return null
  return file.slice(prefix.length).split('/')[0] ?? null
}

/** Feature slice a specifier points at, or null when it targets no slice. */
function importedSlice(specifier, file) {
  const aliased = specifier.match(/^@\/features\/([^/]+)/)
  if (aliased) return aliased[1]
  if (!specifier.startsWith('.')) return null
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  const relative = resolved.match(/\/src\/features\/([^/]+)/)
  return relative ? relative[1] : null
}

function violations() {
  const found = []
  for (const file of trackedFiles()) {
    const source = readFileSync(file, 'utf8')
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1])

    for (const app of ['api', 'dashboard']) {
      const slice = sliceOf(file, app)
      if (!slice) continue

      // R1
      if (file.includes('/__tests__/')) {
        found.push(`${file}: R1 — __tests__/ is not a placement in this repo. Co-locate it next to its source, or use ${app === 'api' ? `src/features/${slice}` : `src/features/${slice}`}/test/unit/.`)
      }
      // R3
      for (const specifier of specifiers) {
        const target = importedSlice(specifier, file)
        if (target && target !== slice && !SHARED_SLICES.has(target)) {
          found.push(`${file}: R3 — test inside slice '${slice}' imports sibling slice '${target}' ('${specifier}'). A cross-slice test belongs in ${app === 'api' ? 'apps/api/test/flow/' : 'apps/dashboard/src/test/cross-slice/'}.`)
        }
      }
    }

    // R2
    const inIntegrationDir = /\/test\/integration\//.test(file)
    const namedIntegration = /\.integration\.test\.tsx?$/.test(file)
    if (namedIntegration && !inIntegrationDir) {
      found.push(`${file}: R2 — *.integration.test.ts must live under a test/integration/ folder.`)
    }
    if (inIntegrationDir && !namedIntegration) {
      found.push(`${file}: R2 — a file under test/integration/ must be named *.integration.test.ts.`)
    }

    // R4
    if (file.startsWith('apps/dashboard/src/test/') && !file.startsWith('apps/dashboard/src/test/cross-slice/')) {
      found.push(`${file}: R4 — apps/dashboard/src/test/ holds setup.ts and cross-slice/ only. Move this test into the slice that owns it.`)
    }

    // R5
    if (/^apps\/api\/test\/flow-[^/]+\.test\.ts$/.test(file)) {
      found.push(`${file}: R5 — cross-slice flow suites live in apps/api/test/flow/.`)
    }

    // R6 — an e2e flow crosses slices by nature; inside the slice tree it would manufacture the
    // cross-slice coupling R3 rejects.
    if (E2E_FILE.test(file) && !file.startsWith('e2e/')) {
      found.push(`${file}: R6 — *.e2e.ts belongs to the top-level e2e/ workspace, never inside a slice.`)
    }

    // R7 — e2e/ is a Playwright project; a *.test.ts there is invisible to it and to every vitest tier.
    if (file.startsWith('e2e/') && TEST_FILE.test(file)) {
      found.push(`${file}: R7 — e2e/ holds *.e2e.ts specs only. A vitest suite belongs to its owning slice.`)
    }
  }
  return found
}

const found = violations()
if (found.length > 0) {
  console.error(`\n  test placement — ${found.length} violation(s)\n`)
  for (const violation of found) console.error(`  ${violation}`)
  console.error(`\n  Rules: _config/testing_conventions.md §0-§1. Layout: docs/testing.md\n`)
  process.exit(1)
}
console.log('  test placement — OK')
