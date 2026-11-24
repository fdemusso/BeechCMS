import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildDevVars, buildPackageJson, buildTsConfig, buildWranglerJsonc } from '../../bin/template.mjs'
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
    name: 'demo', d1Name: 'demo-db', d1Id: 'x', r2Bucket: 'demo-media', jwtSecret: 's', corsOrigins: 'http://localhost:5173',
    publicReadKey: 'r', publicWriteKey: 'w', timeTrapSecret: 't', appUrl: '',
  }))
  assert.match(scaffold().scripts.deploy, /--var ENV:production/)
  assert.equal(config.vars.ENV, 'development')
  assert.equal(config.d1_databases[0].database_name, 'demo-db')
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
