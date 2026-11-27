// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as tiers from './test-tiers.mjs'

const { WORKSPACES, isNeverSelected } = tiers

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function findVitestConfigDirs(dir, rel = '') {
  const dirs = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.turbo') continue
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    const files = readdirSync(full)
    if (files.some((f) => /^vitest(\.[^.]+)?\.config\.(ts|mts|js|mjs)$/.test(f))) {
      dirs.push(nextRel)
    }
    dirs.push(...findVitestConfigDirs(full, nextRel))
  }
  return dirs
}

test('WORKSPACES registers every directory in the repo with a vitest config unless excluded by policy', () => {
  const configDirs = findVitestConfigDirs(ROOT).filter((d) => !isNeverSelected(`${d}/`))
  const trackedDirs = new Set(WORKSPACES.map((ws) => ws.dir))
  const missing = configDirs.filter((d) => !trackedDirs.has(d))

  assert.deepEqual(missing, [], `Directories with vitest config missing from WORKSPACES: ${missing.join(', ')}`)
})

test('matchWorkspace routes packages/search-client, packages/api-client, evals, and scripts/dev-cli', () => {
  assert.equal(tiers.matchWorkspace('packages/search-client/src/client.ts')?.name, 'packages/search-client')
  assert.equal(tiers.matchWorkspace('packages/api-client/src/client.ts')?.name, 'packages/api-client')
  assert.equal(tiers.matchWorkspace('evals/src/tasks.ts')?.name, 'evals')
  assert.equal(tiers.matchWorkspace('scripts/dev-cli/commands/test.ts')?.name, 'scripts/dev-cli')
  assert.equal(tiers.matchWorkspace('packages/testing/src/harness.ts'), null)
  assert.equal(tiers.isSharedHarnessFile('packages/testing/src/harness.ts'), true)
  assert.equal(tiers.isNodeTestScriptFile('scripts/lib/test-tiers.mjs'), true)
  assert.equal(tiers.isNodeTestScriptFile('scripts/test-coverage-diff.mjs'), true)
})

test('findUntrackedSourceFiles flags existing source files outside tracked workspaces and ignores docs/configs/e2e', () => {
  const files = [
    'packages/unknown-pkg/src/index.ts',
    'apps/unregistered/src/app.tsx',
    'README.md',
    'docs/reference/client-sdk.md',
    '.github/workflows/test.yml',
    'e2e/tests/login.e2e.ts',
    'eslint.config.js',
    'packages/search-client/src/deleted.ts',
  ]
  const existing = new Set([
    'packages/unknown-pkg/src/index.ts',
    'apps/unregistered/src/app.tsx',
    'README.md',
    'docs/reference/client-sdk.md',
    '.github/workflows/test.yml',
    'e2e/tests/login.e2e.ts',
    'eslint.config.js',
  ])

  const untracked = tiers.findUntrackedSourceFiles(files, (rel) => existing.has(rel))

  assert.deepEqual(untracked, ['packages/unknown-pkg/src/index.ts', 'apps/unregistered/src/app.tsx'])
})

test('test-coverage-diff exits non-zero when a changed source file falls outside every tracked workspace', () => {
  // Simulate an untracked package source file in an isolated temporary git repo clone/worktree?
  // Instead, create a disposable directory under packages/ in a temporary worktree? No:
  // test-coverage-diff reads git diff against --base, so use a lightweight git init repo copy of scripts/.
  const sandbox = mkdtempSync(join(tmpdir(), 'beech-coverage-diff-'))
  try {
    mkdirSync(join(sandbox, 'scripts', 'lib'), { recursive: true })
    mkdirSync(join(sandbox, 'packages', 'untracked-pkg', 'src'), { recursive: true })

    for (const file of [
      'scripts/test-coverage-diff.mjs',
      'scripts/lib/test-tiers.mjs',
      'scripts/lib/test-resources.mjs',
      'scripts/lib/cpu-slot.mjs',
      'scripts/lib/changed-line-coverage.mjs',
    ]) {
      const content = execFileSync('git', ['show', `HEAD:${file}`], { cwd: ROOT, encoding: 'utf8' })
      writeFileSync(join(sandbox, file), content)
    }

    // Overwrite sandbox scripts with the working-tree scripts under test when present.
    for (const file of ['scripts/test-coverage-diff.mjs', 'scripts/lib/test-tiers.mjs']) {
      if (existsSync(join(ROOT, file))) {
        writeFileSync(join(sandbox, file), readFileSync(join(ROOT, file), 'utf8'))
      }
    }

    execFileSync('git', ['init', '-b', 'devs'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('git', ['add', '.'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: sandbox, stdio: 'ignore' })

    execFileSync('git', ['checkout', '-b', 'feat/untracked'], { cwd: sandbox, stdio: 'ignore' })
    writeFileSync(join(sandbox, 'packages', 'untracked-pkg', 'src', 'index.ts'), 'export const x = 1\n')
    execFileSync('git', ['add', 'packages/untracked-pkg/src/index.ts'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'touch untracked package'], { cwd: sandbox, stdio: 'ignore' })

    const result = spawnSync(
      'node',
      ['scripts/test-coverage-diff.mjs', '--base', 'devs'],
      { cwd: sandbox, encoding: 'utf8', env: { ...process.env, BEECH_CPU_SLOT_HELD: '1' } },
    )

    assert.equal(result.status, 1, `Expected exit 1 for untracked package source, got ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
