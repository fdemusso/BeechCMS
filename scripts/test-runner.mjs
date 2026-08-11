// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { execa } from "execa"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCK_DIR = path.resolve(__dirname, "../node_modules/.cache")
const LOCK_FILE = path.join(LOCK_DIR, "beech-test-runner.lock")

function acquireLock() {
  if (process.env.BEECH_FORCE_TEST === "1") {
    return () => {}
  }

  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true })
  }

  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"))
      const existingPid = lockData.pid
      const startTime = lockData.startTime ? new Date(lockData.startTime).toLocaleTimeString() : "earlier"

      let isAlive = false
      try {
        process.kill(existingPid, 0)
        isAlive = true
      } catch {
        isAlive = false
      }

      if (isAlive) {
        console.log(`\n\x1b[33m⚠️  [Thermal Protection] Test suite is already running in another process (PID: ${existingPid}, started at ${startTime}).\x1b[0m`)
        console.log(`\x1b[33m    Skipping duplicate test execution to protect PC CPU from thermal throttling.\x1b[0m\n`)
        process.exit(0)
      } else {
        // Remove stale lock
        fs.unlinkSync(LOCK_FILE)
      }
    } catch {
      try { fs.unlinkSync(LOCK_FILE) } catch {}
    }
  }

  const lockData = {
    pid: process.pid,
    startTime: new Date().toISOString()
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData), "utf8")

  const cleanup = () => {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const data = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"))
        if (data.pid === process.pid) {
          fs.unlinkSync(LOCK_FILE)
        }
      }
    } catch {}
  }

  process.on("exit", cleanup)
  process.on("SIGINT", () => { cleanup(); process.exit(130) })
  process.on("SIGTERM", () => { cleanup(); process.exit(143) })
  process.on("uncaughtException", (err) => { cleanup(); console.error(err); process.exit(1) })

  return cleanup
}

const releaseLock = acquireLock()

const isCoverage = process.argv.includes("--coverage")
const taskName = isCoverage ? "test:coverage" : "test"

// Auto hardware profiling for Thermal & Memory Protection
const totalCores = os.cpus().length || 4
const totalMemGb = Math.round(os.totalmem() / (1024 * 1024 * 1024)) || 8

// For MacBook Air (8 Cores: 4P+4E, 8GB RAM, Fanless):
// Limit Turbo concurrency to 2 packages & Vitest worker threads to 2 per package.
// Total active workers = 4 threads (perfect fit for the 4 Performance cores without memory swap thrashing).
const defaultTurboConcurrency = totalMemGb <= 8 ? "2" : Math.min(4, Math.max(2, Math.floor(totalCores / 2))).toString()
const defaultVitestThreads = totalMemGb <= 8 ? "2" : Math.min(4, Math.max(2, Math.floor(totalCores / 2))).toString()

const concurrency = process.env.TURBO_CONCURRENCY || process.env.BEECH_MAX_CONCURRENCY || defaultTurboConcurrency
const maxThreads = process.env.VITEST_MAX_THREADS || defaultVitestThreads

console.log(`\x1b[36mRunning BeechCMS tests via Turbo [Hardware Profile: ${totalCores} CPUs, ${totalMemGb}GB RAM | Concurrency=${concurrency}, VitestThreads=${maxThreads}]...\x1b[0m`)

try {
  const child = execa("pnpm", ["turbo", "run", taskName, `--concurrency=${concurrency}`, "--log-order=grouped"], {
    all: true,
    env: {
      FORCE_COLOR: "1",
      VITEST_MAX_THREADS: maxThreads,
      VITEST_MIN_THREADS: "1",
      UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "4"
    }
  })

  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  const { all: output } = await child

  printConsolidatedSummary(output)
} catch (err) {
  if (err.all) {
    printConsolidatedSummary(err.all)
  }
  process.exit(err.exitCode || 1)
} finally {
  releaseLock()
}

function printConsolidatedSummary(output) {
  if (!output) return
  const lines = output.split("\n")
  const summaries = {}

  for (const line of lines) {
    const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
    
    const match = cleanLine.match(/^(\S+):test(?::coverage)?:\s+(Test Files|Tests|Duration|Start at)\s+(.+)$/i)
    if (match) {
      const [_, pkg, type, value] = match
      const cleanPkg = pkg.replace(/:test(:coverage)?$/, "")
      if (!summaries[cleanPkg]) {
        summaries[cleanPkg] = {}
      }
      summaries[cleanPkg][type.trim()] = value.trim()
    }
  }

  const pkgs = Object.keys(summaries)
  if (pkgs.length === 0) return

  console.log("\n\x1b[36m==================================================\x1b[0m")
  console.log("\x1b[36m             CONSOLIDATED TEST SUMMARY            \x1b[0m")
  console.log("\x1b[36m==================================================\x1b[0m")

  for (const pkg of pkgs) {
    const data = summaries[pkg]
    console.log(`\n\x1b[1m\x1b[32m● ${pkg}\x1b[0m`)
    if (data["Start at"]) console.log(`  Start at:  ${data["Start at"]}`)
    if (data["Test Files"]) console.log(`  Test Files: ${data["Test Files"]}`)
    if (data["Tests"]) console.log(`  Tests:      ${data["Tests"]}`)
    if (data["Duration"]) console.log(`  Duration:   ${data["Duration"]}`)
  }
  console.log("\x1b[36m==================================================\x1b[0m\n")
}
