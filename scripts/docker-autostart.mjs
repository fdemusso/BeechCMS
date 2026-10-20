// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Windows has no equivalent of macOS's "open Docker Desktop at login" habit that makes the
// daemon already reachable by the time `pnpm test` / `pnpm dev:full` run. This best-effort
// helper launches Docker Desktop on win32 only — macOS/Linux behavior is untouched.

import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function isDockerDaemonReachable() {
  try {
    execSync('docker info', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** @returns {boolean} true if a launch attempt was made (not whether the daemon came up). */
export function tryLaunchDockerDesktopWindows() {
  if (process.platform !== 'win32') return false

  // Docker Desktop 4.x ships a `docker desktop start` CLI command that raises the app.
  try {
    execSync('docker desktop start', { stdio: 'ignore' })
    return true
  } catch {
    // Fall through to launching the .exe directly.
  }

  const candidates = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Docker', 'Docker Desktop.exe'),
  ]
  for (const exe of candidates) {
    if (fs.existsSync(exe)) {
      try {
        spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
        return true
      } catch {
        // Try the next candidate.
      }
    }
  }
  return false
}

export async function waitForDockerDaemon(timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (isDockerDaemonReachable()) return true
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}
