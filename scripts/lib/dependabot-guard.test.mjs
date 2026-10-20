import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyze, compareVersions, minVersion } from './dependabot-guard.mjs'

const manifest = (deps, section = 'dependencies') => ({ [section]: deps })
const diff = (before, after, section) => analyze([{ file: 'p/package.json', base: manifest(before, section), head: manifest(after, section) }])

test('minVersion reads the lowest version a range admits and ignores non-semver specs', () => {
  assert.deepEqual(minVersion('^8.1.3'), [8, 1, 3])
  assert.deepEqual(minVersion('~1.2.3'), [1, 2, 3])
  assert.deepEqual(minVersion('8.3.0'), [8, 3, 0])
  assert.equal(minVersion('workspace:^0.9.2'), null)
  assert.equal(minVersion('latest'), null)
  assert.equal(minVersion('github:owner/repo#1.2.3'), null)
})

test('compareVersions orders by major, minor, patch', () => {
  assert.equal(compareVersions([8, 3, 0], [8, 1, 6]), 1)
  assert.equal(compareVersions([8, 1, 6], [8, 1, 6]), 0)
  assert.equal(compareVersions([0, 18, 2], [0, 18, 10]), -1)
})

test('a patch or minor bump is neither a downgrade nor a major', () => {
  const report = diff({ vite: '^8.1.3', hono: '4.1.0' }, { vite: '^8.1.6', hono: '4.2.0' })
  assert.deepEqual(report, { downgrades: [], majors: [] })
})

test('a lower range is a downgrade, exact pins included (the vite 8.3.0 -> 8.1.6 case)', () => {
  const report = diff({ vite: '8.3.0' }, { vite: '8.1.6' }, 'devDependencies')
  assert.equal(report.downgrades.length, 1)
  assert.deepEqual(
    { name: report.downgrades[0].name, from: report.downgrades[0].from, to: report.downgrades[0].to },
    { name: 'vite', from: '8.3.0', to: '8.1.6' },
  )
})

test('a major bump is reported as a major, not as a downgrade', () => {
  const report = diff({ zod: '^3.25.0' }, { zod: '^4.0.0' })
  assert.equal(report.downgrades.length, 0)
  assert.equal(report.majors.length, 1)
})

test('workspace ranges, additions and removals are ignored', () => {
  const report = diff({ '@beechcms/core': 'workspace:^0.9.2', a: '1.0.0' }, { '@beechcms/core': 'workspace:^0.9.0', b: '1.0.0' })
  assert.deepEqual(report, { downgrades: [], majors: [] })
})

test('pnpm overrides are checked too', () => {
  const report = analyze([{ file: 'package.json', base: { pnpm: { overrides: { semver: '7.6.0' } } }, head: { pnpm: { overrides: { semver: '7.5.4' } } } }])
  assert.equal(report.downgrades.length, 1)
})
