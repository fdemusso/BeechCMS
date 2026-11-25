// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Process-level test of bin/create.mjs: the first-commit contract only exists after `git commit` runs.
 * It spawns the real scaffolder and writes a temp directory, like publish-manifest.test.mjs does.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PRODUCTION_SECRETS } from '../../bin/template.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT_NAME = 'first-commit-app'

describe('bin/create.mjs first scaffold', () => {
  let workDir
  let projectDir
  let scaffold
  let output
  let devVarEntries

  const git = (...args) => spawnSync('git', ['-C', projectDir, ...args], { encoding: 'utf8' })

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'beech-create-'))
    projectDir = join(workDir, PROJECT_NAME)
    const emptyGitConfig = join(workDir, 'empty-gitconfig')
    writeFileSync(emptyGitConfig, '')

    // A global commit.gpgsign or a missing identity turns the commit into "Git skipped",
    // and the test would then check nothing.
    scaffold = spawnSync(process.execPath, [join(ROOT, 'bin', 'create.mjs'), PROJECT_NAME, '--yes', '--no-install'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: emptyGitConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Scaffold Test',
        GIT_AUTHOR_EMAIL: 'scaffold-test@example.com',
        GIT_COMMITTER_NAME: 'Scaffold Test',
        GIT_COMMITTER_EMAIL: 'scaffold-test@example.com',
      },
    })
    output = scaffold.stdout + scaffold.stderr

    // The test cannot import the CLI's TypeScript parser across packages.
    const devVars = readFileSync(join(projectDir, '.dev.vars'), 'utf8')
    devVarEntries = [...devVars.matchAll(/^([A-Z][A-Z0-9_]*)=(.+)$/gm)].map(([, name, value]) => ({ name, value }))
  })

  after(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('the scaffolder exits 0 and its first commit tracks wrangler.jsonc and .gitignore but not .dev.vars', () => {
    const head = git('rev-parse', 'HEAD')
    const tracked = git('ls-files').stdout.split('\n')

    assert.equal(scaffold.status, 0)
    assert.equal(head.status, 0)
    assert.ok(tracked.includes('wrangler.jsonc'))
    assert.ok(tracked.includes('.gitignore'))
    assert.ok(!tracked.includes('.dev.vars'))
  })

  it('no value from .dev.vars appears in any file of the first commit', () => {
    // Precondition: the check below is vacuous if a secret was not parsed.
    const names = devVarEntries.map((entry) => entry.name)
    for (const secret of PRODUCTION_SECRETS) assert.ok(names.includes(secret), secret)

    // Regression guard: wrangler.jsonc used to commit JWT_SECRET and the anti-bot secret (#995).
    for (const { name, value } of devVarEntries) {
      assert.equal(git('grep', '-F', '-q', '-e', value, 'HEAD').status, 1, `${name} found in the first commit`)
    }
  })

  it('the scaffolder output names every production secret but prints none of the .dev.vars values', () => {
    for (const secret of PRODUCTION_SECRETS) assert.ok(output.includes(`wrangler secret put ${secret}`), secret)

    for (const { name, value } of devVarEntries) {
      assert.ok(!output.includes(value), `${name} value printed`)
    }
  })
})
