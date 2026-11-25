// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEV_PUBLISHABLE_KEY,
  DEV_SECRET_KEY,
  PRODUCTION_SECRETS,
  buildDevVars,
  buildPackageJson,
  buildTsConfig,
  buildWranglerJsonc,
} from '../../bin/template.mjs'
import { computeTemplateVersions } from './template-versions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifest = (path) => JSON.parse(readFileSync(join(ROOT, path, 'package.json'), 'utf8'))
const scaffold = () => JSON.parse(buildPackageJson('demo', 'demo-db', computeTemplateVersions(ROOT)))

test('wrangler and workers-types follow the ranges the CLI and the API are built against (#1020)', () => {
  const pkg = scaffold()
  assert.equal(pkg.devDependencies.wrangler, manifest('packages/cli').dependencies.wrangler)
  assert.equal(
    pkg.devDependencies['@cloudflare/workers-types'],
    manifest('apps/api').devDependencies['@cloudflare/workers-types'],
  )
})

test('the project depends on the CLI for the beech bin, never on the scaffolder (#1019)', () => {
  const pkg = scaffold()
  assert.ok(pkg.devDependencies['@beechcms/cli'])
  assert.equal(pkg.devDependencies['@beechcms/cms'], undefined)
  assert.equal(pkg.dependencies['@beechcms/cms'], undefined)
})

test('the scaffolded @beechcms ranges are the versions the packages are released at', () => {
  const pkg = scaffold()
  assert.equal(pkg.dependencies['@beechcms/api'], `^${manifest('apps/api').version}`)
  assert.equal(pkg.dependencies['@beechcms/core'], `^${manifest('packages/core').version}`)
  assert.equal(pkg.devDependencies['@beechcms/cli'], `^${manifest('packages/cli').version}`)
})

test('dev applies the local migrations to the configured database before serving (#1021)', () => {
  const { scripts } = scaffold()
  assert.equal(scripts['db:migrate:local'], 'wrangler d1 migrations apply demo-db --local')
  assert.match(scripts.dev, /^npm run db:migrate:local && wrangler dev/)
})

test('a deploy runs as production, a local run as development', () => {
  const config = JSON.parse(buildWranglerJsonc({
    name: 'demo', d1Name: 'demo-db', d1Id: 'x', r2Bucket: 'demo-media', corsOrigins: 'http://localhost:5173', appUrl: '',
  }))
  assert.match(scaffold().scripts.deploy, /--var ENV:production/)
  assert.equal(config.vars.ENV, 'development')
  assert.equal(config.d1_databases[0].database_name, 'demo-db')
})

test('wrangler.jsonc vars carry only ENV, CORS_ORIGINS, BEECH_PUBLISHABLE_KEY and APP_URL', () => {
  const { vars } = JSON.parse(buildWranglerJsonc({
    name: 'demo', d1Name: 'demo-db', d1Id: 'x', r2Bucket: 'demo-media', corsOrigins: 'http://localhost:5173', appUrl: '',
  }))
  assert.deepEqual(Object.keys(vars), ['ENV', 'CORS_ORIGINS', 'BEECH_PUBLISHABLE_KEY', 'APP_URL'])
  assert.equal(vars.BEECH_PUBLISHABLE_KEY, DEV_PUBLISHABLE_KEY)
})

test('.dev.vars defines every production secret, with the dev secret key and 64-hex JWT and Time-Trap secrets, with and without Cloudflare credentials', () => {
  const cloudflareFixture = {
    r2AccessKey: 'access', r2SecretKey: 'secret', r2Endpoint: 'https://acc.r2.cloudflarestorage.com', r2Bucket: 'demo-media',
  }
  for (const cloudflare of [null, cloudflareFixture]) {
    const vars = buildDevVars(cloudflare)
    for (const name of PRODUCTION_SECRETS) {
      assert.equal(vars.match(new RegExp(`^${name}=.+$`, 'gm'))?.length, 1, name)
    }
    assert.match(vars, new RegExp(`^BEECH_SECRET_KEY=${DEV_SECRET_KEY}$`, 'm'))
    assert.match(vars, /^JWT_SECRET=[0-9a-f]{64}$/m)
    assert.match(vars, /^PUBLIC_TIME_TRAP_SECRET=[0-9a-f]{64}$/m)
  }
})

test('two builds generate different JWT and Time-Trap secrets, and the two differ from each other', () => {
  const read = (vars, name) => vars.match(new RegExp(`^${name}=(.+)$`, 'm'))[1]
  const first = buildDevVars(null)
  const second = buildDevVars(null)

  // Regression guard: a hardcoded or shared secret would pass every format check.
  assert.notEqual(read(first, 'JWT_SECRET'), read(second, 'JWT_SECRET'))
  assert.notEqual(read(first, 'PUBLIC_TIME_TRAP_SECRET'), read(second, 'PUBLIC_TIME_TRAP_SECRET'))
  assert.notEqual(read(first, 'JWT_SECRET'), read(first, 'PUBLIC_TIME_TRAP_SECRET'))
})

test('without Cloudflare credentials .dev.vars sets no R2 variable, so local uploads use the R2 binding', () => {
  const vars = buildDevVars(null)
  assert.doesNotMatch(vars, /^R2_[A-Z_]+=/m)
  assert.match(vars, /^PRIVACY_MASTER_KEY=[0-9a-f]{64}$/m)
})

test('the worker is type-checked against workers-types without the DOM lib that clashes with it (#1020)', () => {
  const { compilerOptions } = JSON.parse(buildTsConfig())
  assert.deepEqual(compilerOptions.lib, ['ES2022'])
  assert.deepEqual(compilerOptions.types, ['@cloudflare/workers-types'])
})
