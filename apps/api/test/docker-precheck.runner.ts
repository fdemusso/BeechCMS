// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { assertDockerStackReady } from './docker-precheck'

// Load .dev.vars into process.env for local dev (only if env var not already set).
// In CI, env vars are injected by the workflow and take precedence.
function loadDevVars() {
  const candidates = ['.dev.vars', 'apps/api/.dev.vars']
  for (const rel of candidates) {
    if (!fs.existsSync(rel)) continue
    for (const line of fs.readFileSync(rel, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
    return
  }
}

// Derive BEECH_*_PORT vars from .dev.vars values so docker compose starts
// containers on the same ports that the test env expects.
function syncDockerPortsFromDevVars() {
  const r2 = process.env.R2_ENDPOINT
  if (r2 && !process.env.BEECH_MINIO_PORT) {
    const m = r2.match(/:(\d+)\/?$/)
    if (m) process.env.BEECH_MINIO_PORT = m[1]
  }
  const webhookUrl = process.env.WEBHOOK_TESTER_URL
  if (webhookUrl && !process.env.BEECH_WEBHOOK_TESTER_PORT) {
    const m = webhookUrl.match(/:(\d+)\/?$/)
    if (m) process.env.BEECH_WEBHOOK_TESTER_PORT = m[1]
  }
  // SMTP_PORT in .dev.vars is set to the Mailpit HTTP UI port by dev.mjs
  const smtpPort = process.env.SMTP_PORT
  if (smtpPort && !process.env.BEECH_MAILPIT_UI_PORT) {
    process.env.BEECH_MAILPIT_UI_PORT = smtpPort
  }
}

function findComposeRoot(): string {
  // vitest cwd is apps/api when running via npm test -w @beechcms/api
  const candidates = [path.resolve('../../'), path.resolve('.')]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'docker/docker-compose.yml'))) return path.join(dir, 'docker')
  }
  return path.resolve('../../docker')
}

async function tryStartDockerStack(): Promise<void> {
  console.log('\n🐳 Docker stack not running — attempting to start containers...')
  syncDockerPortsFromDevVars()

  const composeRoot = findComposeRoot()
  try {
    execSync('docker compose up -d', { cwd: composeRoot, stdio: 'inherit' })
  } catch {
    return // docker compose failed; assertDockerStackReady will report the real error
  }

  console.log('⏳ Waiting for services to become ready (up to 30s)...')
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      await assertDockerStackReady()
      console.log('✅ Docker stack is ready.\n')
      return
    } catch {
      // not yet ready — keep waiting
    }
  }
  // timed out; let the final assertDockerStackReady below produce the error
}

export async function setup() {
  loadDevVars()
  syncDockerPortsFromDevVars()
  try {
    await assertDockerStackReady()
  } catch {
    await tryStartDockerStack()
    await assertDockerStackReady() // throws with full diagnostic if still not ready
  }
}
