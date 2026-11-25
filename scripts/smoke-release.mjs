#!/usr/bin/env node
/**
 * Release smoke test: the path a new user takes, run against the code about to be published.
 *
 * Packs @beechcms/cms (from the same staging directory a release publishes), core, cli and api,
 * installs the scaffolder from its tarball in a clean folder, scaffolds a project with it, installs
 * the project (npm only, no --legacy-peer-deps), starts `npm run dev`, creates the first admin,
 * checks the Public API keys (publishable reads, secret writes, publishable write refused) and
 * uploads an image with no Docker and no Cloudflare credentials.
 *
 * Needs the workspace built (`pnpm build`). Usage:
 *   node scripts/smoke-release.mjs [--keep] [--budget-seconds <n>]
 *
 * It runs from a short folder on purpose: wrangler's local D1 file does not fit under a long
 * Windows path (see packages/cli/src/lib/path-limits.ts). Override with BEECH_SMOKE_DIR.
 */

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stageScaffolder } from './lib/publish-manifest.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WINDOWS = process.platform === 'win32'
const KEEP = process.argv.includes('--keep')
const budgetFlag = process.argv.indexOf('--budget-seconds')
const BUDGET_SECONDS = budgetFlag === -1 ? null : Number(process.argv[budgetFlag + 1])

/** The workspace packages a scaffolded project installs from the registry. */
const PROJECT_PACKAGES = [
  { name: '@beechcms/core', dir: 'packages/core' },
  { name: '@beechcms/cli', dir: 'packages/cli' },
  { name: '@beechcms/api', dir: 'apps/api' },
]

const PASSWORD = 'Sup3r-Secret-Pass!9'
// The values the docs promise, written as literals on purpose and not imported from bin/template.mjs,
// so a template typo fails the smoke test.
const PUBLISHABLE_KEY = 'beech_pk_dev'
const SECRET_KEY = 'beech_sk_dev'
const SMOKE_SEED = 'smoke_notes'
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const timings = []
const log = (message) => console.log(`  ${message}`)

function fail(message) {
  throw new Error(message)
}

/** Runs a command to completion; throws with the tail of its output on a non-zero exit. */
function sh(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: IS_WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n')
    fail(`${command} ${args.join(' ')} exited with ${result.status}\n${output}`)
  }
  return result.stdout
}

async function timed(label, action) {
  const started = Date.now()
  const value = await action()
  timings.push({ label, seconds: (Date.now() - started) / 1000 })
  return value
}

function workDirectory() {
  if (process.env.BEECH_SMOKE_DIR) return resolve(process.env.BEECH_SMOKE_DIR)
  return IS_WINDOWS ? 'C:\\bsmoke' : mkdtempSync(join(tmpdir(), 'bsmoke-'))
}

function removeDirectory(path) {
  // workerd can hold its files for a moment after the process is gone, notably on Windows.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch {
      spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'])
    }
  }
  log(`could not remove ${path}; delete it by hand`)
}

function tarballName(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

function ensureBuilt() {
  const missing = PROJECT_PACKAGES.map((pkg) => join(ROOT, pkg.dir, 'dist')).filter((dir) => !existsSync(dir))
  if (missing.length) fail(`Build the workspace first (pnpm build). Missing: ${missing.join(', ')}`)

  const assets = join(ROOT, 'apps/api/assets/dashboard')
  const dashboard = join(ROOT, 'apps/dashboard/dist/admin')
  if (!existsSync(assets)) {
    if (!existsSync(dashboard)) fail('The dashboard is not built (apps/dashboard/dist/admin is missing).')
    cpSync(dashboard, assets, { recursive: true })
    log('copied the built dashboard into apps/api/assets (a release does the same)')
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return
  if (IS_WINDOWS) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  else process.kill(-child.pid, 'SIGTERM')
}

async function waitFor(check, { seconds, describe, child, output }) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`${describe}: the dev server exited with ${child.exitCode}\n${output().slice(-2000)}`)
    try {
      const value = await check()
      if (value) return value
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  fail(`${describe}: not ready after ${seconds}s\n${output().slice(-2000)}`)
}

async function json(response) {
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    return fail(`Expected JSON, got ${response.status}: ${body.slice(0, 200)}`)
  }
}

async function main() {
  ensureBuilt()

  const base = workDirectory()
  removeDirectory(base)
  mkdirSync(base, { recursive: true })
  const tarballs = join(base, 'tarballs')
  const runner = join(base, 'runner')
  const projectDir = join(base, 'smoke-app')
  mkdirSync(tarballs)
  mkdirSync(runner)

  let devServer = null
  try {
    log(`working in ${base}`)

    const packed = {}
    await timed('pack packages', () => {
      for (const pkg of PROJECT_PACKAGES) {
        const { version } = JSON.parse(readFileSync(join(ROOT, pkg.dir, 'package.json'), 'utf8'))
        sh('pnpm', ['pack', '--pack-destination', tarballs], { cwd: join(ROOT, pkg.dir) })
        packed[pkg.name] = join(tarballs, tarballName(pkg.name, version)).replaceAll('\\', '/')
        if (!existsSync(packed[pkg.name])) fail(`pnpm pack did not produce ${packed[pkg.name]}`)
      }
      const stage = stageScaffolder(ROOT)
      try {
        sh('npm', ['pack', '--pack-destination', tarballs], { cwd: stage })
      } finally {
        rmSync(stage, { recursive: true, force: true })
      }
    })

    const cmsTarball = readdirSync(tarballs).find((file) => file.startsWith('beechcms-cms-'))
    if (!cmsTarball) fail('npm pack did not produce the @beechcms/cms tarball')

    // #1019: installing the published scaffolder must not run a script that is not in the tarball.
    await timed('install the scaffolder', () => {
      sh('npm', ['init', '-y'], { cwd: runner })
      sh('npm', ['install', join(tarballs, cmsTarball), '--foreground-scripts', '--no-fund', '--no-audit'], { cwd: runner })
    })

    await timed('scaffold', () => {
      const create = join(runner, 'node_modules', '@beechcms', 'cms', 'bin', 'create.mjs')
      sh(process.execPath, [create, 'smoke-app', '--yes', '--no-install'], { cwd: base })
    })

    // The project installs @beechcms/* from the tarballs; everything else resolves from the registry.
    const port = await freePort()
    const manifestPath = join(projectDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.overrides = {}
    for (const section of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(manifest[section] ?? {})) {
        if (packed[name]) {
          manifest[section][name] = `file:${packed[name]}`
          manifest.overrides[name] = `file:${packed[name]}`
        }
      }
    }
    manifest.scripts.dev = manifest.scripts.dev.replace('--port 8789', `--port ${port}`)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    // #1020: a plain install must resolve (no --legacy-peer-deps, no --force).
    await timed('npm install', () => {
      sh('npm', ['install', '--foreground-scripts', '--no-fund', '--no-audit'], { cwd: projectDir })
    })

    await timed('type-check the worker', () => {
      sh('npx', ['tsc', '--noEmit', '-p', '.'], { cwd: projectDir })
    })

    let output = ''
    const startedDev = Date.now()
    devServer = spawn('npm', ['run', 'dev'], {
      cwd: projectDir,
      shell: IS_WINDOWS,
      detached: !IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    devServer.stdout.on('data', (chunk) => { output += chunk })
    devServer.stderr.on('data', (chunk) => { output += chunk })

    const origin = `http://127.0.0.1:${port}`
    const setupState = await waitFor(
      async () => {
        const response = await fetch(`${origin}/auth/setup`)
        return response.ok ? json(response) : null
      },
      { seconds: 240, describe: 'GET /auth/setup', child: devServer, output: () => output },
    )
    timings.push({ label: 'migrate + start dev server', seconds: (Date.now() - startedDev) / 1000 })
    if (setupState.needsSetup !== true) fail(`Expected needsSetup: true, got ${JSON.stringify(setupState)}`)
    if (!/0046_agent_intents|✅/.test(output)) log('warning: the migration table was not found in the dev output')

    await timed('first admin and login', async () => {
      const setup = await fetch(`${origin}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: PASSWORD,
          name: 'Smoke',
          surname: 'Test',
          settings: { language: 'en', timezone: 'Europe/Rome', currency: 'EUR' },
        }),
      })
      if (!setup.ok) fail(`POST /auth/setup returned ${setup.status}: ${await setup.text()}`)

      const login = await fetch(`${origin}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: PASSWORD }),
      })
      if (!login.ok) fail(`POST /auth/login returned ${login.status}`)
      const { token } = await json(login)
      globalThis.smokeToken = token
    })

    await timed('public API keys', async () => {
      const bearer = { Authorization: `Bearer ${globalThis.smokeToken}` }
      const jsonHeaders = { 'Content-Type': 'application/json' }
      const entriesUrl = `${origin}/api/v1/public/${SMOKE_SEED}`
      const describeFailure = async (step, response) =>
        `${step} returned ${response.status}: ${(await response.text()).slice(0, 200)}`

      // The Time-Trap secret is read from .dev.vars.
      const trap = await fetch(`${origin}/api/v1/public/timetrap/token`)
      if (trap.status !== 200) fail(await describeFailure('GET /api/v1/public/timetrap/token', trap))
      const { token: trapToken } = await json(trap)
      if (!trapToken) fail('GET /api/v1/public/timetrap/token returned no token')

      const created = await fetch(`${origin}/api/seeds`, {
        method: 'POST',
        headers: { ...bearer, ...jsonHeaders },
        body: JSON.stringify({
          slug: SMOKE_SEED,
          label: 'Smoke note',
          displayNameAlias: 'title',
          allowPublicRead: true,
          allowPublicPost: true,
          branches: [{ alias: 'title', label: 'Title', type: 'text' }],
        }),
      })
      if (created.status !== 201) fail(await describeFailure('POST /api/seeds', created))

      const read = await fetch(entriesUrl, { headers: { 'X-API-Key': PUBLISHABLE_KEY } })
      if (read.status !== 200) fail(await describeFailure('GET public entries with the publishable key', read))

      const add = (key) => fetch(`${entriesUrl}/add`, {
        method: 'POST',
        headers: { ...jsonHeaders, 'X-API-Key': key },
        body: JSON.stringify({ data: { title: 'From the server' } }),
      })

      const serverWrite = await add(SECRET_KEY)
      if (serverWrite.status !== 201) fail(await describeFailure('POST public add with the secret key', serverWrite))

      const browserWrite = await add(PUBLISHABLE_KEY)
      if (browserWrite.status !== 403) fail(await describeFailure('POST public add with the publishable key', browserWrite))
      const rejection = await json(browserWrite)
      if (!String(rejection.type).endsWith('public-api-secret-key-required')) {
        fail(`POST public add with the publishable key: unexpected error ${JSON.stringify(rejection).slice(0, 200)}`)
      }

      // One entry proves the 201 persisted and the 403 wrote nothing.
      // A different URL: the first read is edge-cached for 60 s and still answers with the empty list.
      const listed = await fetch(`${entriesUrl}?limit=10`, { headers: { 'X-API-Key': PUBLISHABLE_KEY } })
      if (listed.status !== 200) fail(await describeFailure('GET public entries after the writes', listed))
      const { data, meta } = await json(listed)
      const titles = data.map((entry) => entry.title)
      if (meta.total !== 1 || titles.length !== 1 || titles[0] !== 'From the server') {
        fail(`Expected exactly one entry "From the server", got total ${meta.total}: ${JSON.stringify(data).slice(0, 200)}`)
      }
    })

    await timed('upload and read back an image', async () => {
      const headers = { Authorization: `Bearer ${globalThis.smokeToken}` }

      // Without S3 credentials the direct upload is refused; the dashboard then falls back to the proxy.
      const presign = await fetch(`${origin}/api/upload/presign`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'pixel.png', mimeType: 'image/png', sizeBytes: ONE_PIXEL_PNG.length }),
      })
      if (presign.status !== 501) fail(`Expected the presign to be refused with 501, got ${presign.status}`)

      const form = new FormData()
      form.append('file', new Blob([ONE_PIXEL_PNG], { type: 'image/png' }), 'pixel.png')
      const upload = await fetch(`${origin}/api/upload`, { method: 'POST', headers, body: form })
      if (!upload.ok) fail(`POST /api/upload returned ${upload.status}: ${await upload.text()}`)
      const { url } = await json(upload)

      const media = await fetch(url.replace(/^https?:\/\/[^/]+/, origin))
      const bytes = Buffer.from(await media.arrayBuffer())
      if (!media.ok || !media.headers.get('content-type')?.startsWith('image/png') || !bytes.equals(ONE_PIXEL_PNG)) {
        fail(`The uploaded image did not come back intact (${media.status}, ${media.headers.get('content-type')})`)
      }
    })

    // A first run with the defaults must not print a storage warning: there is nothing for the user to fix.
    if (/NullBucket|MEDIA_BUCKET is bound|Storage is not configured/.test(output)) {
      fail(`The dev server warned about storage on a default project:
${output.slice(-2000)}`)
    }

    await timed('dashboard is served', async () => {
      const admin = await fetch(`${origin}/admin/`)
      const html = await admin.text()
      if (!admin.ok || !html.includes('<div id="root"')) fail(`GET /admin/ returned ${admin.status} without the app shell`)
    })
  } finally {
    if (devServer) stopTree(devServer)
    if (!KEEP) {
      await new Promise((done) => setTimeout(done, 1500))
      removeDirectory(base)
    }
  }
}

main().then(
  () => {
    console.log('\n  Release smoke test passed\n')
    for (const { label, seconds } of timings) console.log(`  ${label.padEnd(30)} ${seconds.toFixed(1)}s`)
    const total = timings.reduce((sum, entry) => sum + entry.seconds, 0)
    console.log(`  ${'total'.padEnd(30)} ${total.toFixed(1)}s\n`)
    if (BUDGET_SECONDS && total > BUDGET_SECONDS) {
      console.error(`  Over the ${BUDGET_SECONDS}s budget\n`)
      process.exit(1)
    }
  },
  (error) => {
    console.error(`\n  Release smoke test FAILED\n\n${error.message}\n`)
    process.exit(1)
  },
)
