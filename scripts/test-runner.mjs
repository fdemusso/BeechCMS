// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { execa } from "execa"

import { execSync } from "node:child_process"
import crypto from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, "..")
const CACHE_DIR = path.resolve(__dirname, "../node_modules/.cache/beech-test-runner")
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

function computeRepoFingerprint() {
  const raw = execSync("git ls-files -z --cached --others --exclude-standard", {
    cwd: ROOT_DIR,
    maxBuffer: 32 * 1024 * 1024
  })

  const files = raw.toString().split("\0").filter(Boolean)

  // Exclude patterns that do not influence runtime code or test execution
  const NON_CODE_PATTERNS = [
    /\.md$/i,
    /^docs\//i,
    /^\.github\//i,
    /^\.husky\//i,
    /(^|\/)\.gitignore$/i,
    /(^|\/)\.npmignore$/i,
    /(^|\/)\.semgrepignore$/i,
    /(^|\/)\.gitkeep$/i,
    /(^|\/)\.graphifyignore$/i,
    /\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|tiff|avif)$/i,
    /^(sonar-project\.properties|skills-lock\.json|typedoc\.json|doctor\.config\.ts)$/i,
    /(^|\/)doctor\.config\.json$/i,
    /^\.react-doctor\//i,
    /(^|\/)\.agents(\/|$)/i,
    /(^|\/)\.cursor(\/|$)/i,
    /(^|\/)\.claude(\/|$)/i,
    /(^|\/)\.gemini(\/|$)/i,
    /(^|\/)\.antigravity(\/|$)/i,
    /(^|\/)\.cursorrules$/i,
    /(^|\/)\.cursorignore$/i,
    /(^|\/)\.mcp\.json$/i,
    /^graphify/i,
    /^scratch(\/|$)/i,
    /\.example$/i
  ]

  const candidateFiles = files.filter(f => !NON_CODE_PATTERNS.some(p => p.test(f)))

  // Exclude files matching .gitignore even if tracked
  let ignoredSet = new Set()
  if (candidateFiles.length > 0) {
    try {
      const ignoredRaw = execSync("git check-ignore -z --no-index --stdin", {
        cwd: ROOT_DIR,
        input: candidateFiles.join("\0"),
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["pipe", "pipe", "ignore"]
      })
      ignoredSet = new Set(ignoredRaw.toString().split("\0").filter(Boolean))
    } catch (e) {
      if (e.stdout) {
        ignoredSet = new Set(e.stdout.toString().split("\0").filter(Boolean))
      }
    }
  }

  const finalFiles = candidateFiles.filter(f => !ignoredSet.has(f)).sort()

  const hasher = crypto.createHash("sha256")
  for (const relPath of finalFiles) {
    const fullPath = path.resolve(ROOT_DIR, relPath)
    hasher.update(relPath)
    hasher.update("\0")
    try {
      const stats = fs.statSync(fullPath)
      if (stats.isFile()) {
        const content = fs.readFileSync(fullPath)
        hasher.update(content)
      } else {
        hasher.update("__DIR__")
      }
    } catch {
      hasher.update("__DELETED__")
    }
    hasher.update("\0")
  }

  return {
    fingerprint: hasher.digest("hex"),
    fileCount: finalFiles.length
  }
}

const releaseLock = acquireLock()

const isCoverage = process.argv.includes("--coverage")
const taskName = isCoverage ? "test:coverage" : "test"
const sanitizedTaskName = taskName.replace(/[^a-zA-Z0-9_-]/g, "_")
const CACHE_FILE = path.join(CACHE_DIR, `cache-${sanitizedTaskName}.json`)

function readCache(currentFingerprint) {
  if (process.env.BEECH_NO_CACHE === "1" || process.argv.includes("--no-cache") || process.argv.includes("--force")) {
    return null
  }
  if (!fs.existsSync(CACHE_FILE)) {
    return null
  }
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"))
    if (data.fingerprint === currentFingerprint && data.taskName === taskName) {
      return data
    }
  } catch {}
  return null
}

function writeCache(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf8")
  } catch (err) {
    console.warn(`\x1b[33m⚠️  [Test Cache] Failed to write cache: ${err.message}\x1b[0m`)
  }
}

function clearCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE)
    }
  } catch {}
}

const { fingerprint, fileCount } = computeRepoFingerprint()
const cachedResult = readCache(fingerprint)

if (cachedResult) {
  console.log(`\n\x1b[32m✔ [Test Cache] Snapshot fingerprint matched: ${fingerprint.slice(0, 12)} (${fileCount} files scanned)\x1b[0m`)
  console.log(`\x1b[36m⚡ [Test Cache] Replaying cached results from ${new Date(cachedResult.timestamp).toLocaleTimeString()} (Task: ${taskName})...\x1b[0m\n`)
  
  if (cachedResult.output) {
    process.stdout.write(cachedResult.output)
  }
  printConsolidatedSummary(cachedResult.output)

  console.log(`\x1b[32m⚡ [Test Cache] Instant replay from cache completed. All ${fileCount} files match snapshot.\x1b[0m\n`)
  releaseLock()
  process.exit(cachedResult.exitCode ?? 0)
}

if (fs.existsSync(CACHE_FILE)) {
  clearCache()
  console.log(`\x1b[33m🔄 [Test Cache] Repository snapshot changed (${fileCount} files, fingerprint: ${fingerprint.slice(0, 12)}). Cache invalidated.\x1b[0m`)
} else {
  console.log(`\x1b[36m⚡ [Test Cache] Calculating snapshot for ${fileCount} files (fingerprint: ${fingerprint.slice(0, 12)})...\x1b[0m`)
}

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

  writeCache({
    fingerprint,
    taskName,
    fileCount,
    timestamp: new Date().toISOString(),
    exitCode: 0,
    output: output || ""
  })
} catch (err) {
  if (err.all) {
    printConsolidatedSummary(err.all)
  }
  writeCache({
    fingerprint,
    taskName,
    fileCount,
    timestamp: new Date().toISOString(),
    exitCode: err.exitCode || 1,
    output: err.all || err.message || ""
  })
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
