import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sanitizeManifest, stageScaffolder } from './publish-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const rootManifest = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

test('the published manifest carries no lifecycle or monorepo script (#1019)', () => {
  const published = sanitizeManifest(rootManifest())
  assert.equal(published.scripts, undefined)
  assert.equal(published.devDependencies, undefined)
  assert.equal(published.packageManager, undefined)
})

test('the published manifest keeps what the scaffolder needs to run', () => {
  const published = sanitizeManifest(rootManifest())
  assert.deepEqual(published.bin, { cms: 'bin/create.mjs' })
  assert.deepEqual(Object.keys(published.dependencies).sort(), ['@clack/prompts', 'picocolors'])
  assert.equal(published.name, '@beechcms/cms')
})

test('a workspace range in the published dependencies is refused', () => {
  const manifest = { name: '@beechcms/cms', dependencies: { '@beechcms/cli': 'workspace:^0.10.1' } }
  assert.throws(() => sanitizeManifest(manifest), /workspace range/)
})

test('the staged tarball ships the scaffolder, its template and the versions it pins', () => {
  const stage = stageScaffolder(ROOT)
  try {
    const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: stage, encoding: 'utf8', shell: process.platform === 'win32' })
    const files = JSON.parse(pack.stdout)[0].files.map((file) => file.path)
    assert.ok(files.includes('bin/create.mjs'))
    assert.ok(files.includes('bin/template.mjs'))
    assert.ok(files.includes('bin/template-versions.json'))
    assert.equal(JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8')).scripts, undefined)
    assert.ok(existsSync(join(stage, 'LICENSE')))
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
})
