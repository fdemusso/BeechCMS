// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Machine-wide semaphore for CPU-heavy local commands (tests, type-check, lint, build).
//
// The slot files live in os.tmpdir(), NOT under the repo: every git worktree has its own
// node_modules/, so a lock kept there is invisible to an agent working in a sibling worktree.
// That is exactly how parallel Bug Fixer agents ended up stacking test runs on one CPU.
//
// A caller waits (queues) for a free slot; it never skips the run. A skipped run that exits 0
// reads as "tests passed" to an agent, which is worse than a slow run.
//
// Slots: BEECH_CPU_SLOTS (default 1 = fully serialised). `exclusive` claims every slot, for
// runs that need the whole machine or the shared Docker stack (flow tier empties the shared
// MinIO test bucket in its global setup, so two concurrent flow runs delete each other's objects).
//
// Disabled when CI is set (dedicated runners) or BEECH_CPU_SLOT=0. A process started inside a
// held slot inherits BEECH_CPU_SLOT_HELD=1 and never re-acquires, so nesting cannot deadlock.

import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const SLOT_DIR = path.join(os.tmpdir(), "beech-cpu-slots")
export const HELD_ENV = "BEECH_CPU_SLOT_HELD"

/** Exit code for "gave up waiting for a slot" — distinct from any test result. */
export const EXIT_SLOT_TIMEOUT = 75

const positiveInt = (value) => {
  const n = Number.parseInt(value ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function slotCount(env = process.env) {
  return positiveInt(env.BEECH_CPU_SLOTS) ?? 1
}

export function slotsDisabled(env = process.env) {
  return Boolean(env.CI) || env.BEECH_CPU_SLOT === "0" || env[HELD_ENV] === "1"
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return err.code === "EPERM"
  }
}

function readHolder(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

function isStale(holder, maxHoldMs, now) {
  if (!holder) return true
  if (!isAlive(holder.pid)) return true
  // Windows recycles PIDs; a dead agent's PID reused by an unrelated process must not
  // pin the slot forever.
  return now - Date.parse(holder.startedAt) > maxHoldMs
}

function tryWrite(file, holder) {
  try {
    fs.writeFileSync(file, JSON.stringify(holder), { flag: "wx" })
    return true
  } catch (err) {
    if (err.code !== "EEXIST") throw err
    return false
  }
}

function tryClaim(file, holder, maxHoldMs) {
  if (tryWrite(file, holder)) return true

  const current = readHolder(file)
  if (!isStale(current, maxHoldMs, Date.now())) return false

  // Re-read right before unlinking so a slot another waiter just claimed is left alone.
  const again = readHolder(file)
  if (again?.token === current?.token) {
    try {
      fs.unlinkSync(file)
    } catch {
      // Swallow: another waiter removed it first
    }
  }
  return tryWrite(file, holder)
}

function describeHolders(files) {
  return files
    .map(readHolder)
    .filter(Boolean)
    .map((h) => `PID ${h.pid} "${h.label}" in ${h.cwd} since ${new Date(h.startedAt).toLocaleTimeString()}`)
}

/**
 * Waits for a slot (or every slot when `exclusive`) and returns a release function.
 * Throws an Error with `code = 'SLOT_TIMEOUT'` when `timeoutMs` elapses first.
 *
 * @param {{ exclusive?: boolean, label?: string, env?: NodeJS.ProcessEnv, pollMs?: number,
 *           timeoutMs?: number, log?: (line: string) => void }} [options]
 * @returns {Promise<() => void>}
 */
export async function acquireCpuSlot({
  exclusive = false,
  label = process.argv.slice(1).join(" "),
  env = process.env,
  pollMs = 2000,
  timeoutMs = (positiveInt(env.BEECH_CPU_SLOT_TIMEOUT_MIN) ?? 30) * 60_000,
  log = (line) => console.error(line),
} = {}) {
  if (slotsDisabled(env)) return () => {}

  fs.mkdirSync(SLOT_DIR, { recursive: true })
  const total = slotCount(env)
  const maxHoldMs = (positiveInt(env.BEECH_CPU_SLOT_MAX_HOLD_MIN) ?? 90) * 60_000
  const files = Array.from({ length: total }, (_, i) => path.join(SLOT_DIR, `slot-${i}.json`))
  const holder = {
    pid: process.pid,
    token: crypto.randomUUID(),
    label,
    exclusive,
    cwd: process.cwd(),
    startedAt: new Date().toISOString(),
  }

  const claimed = []
  const release = () => {
    for (const file of claimed.splice(0)) {
      if (readHolder(file)?.token === holder.token) {
        try {
          fs.unlinkSync(file)
        } catch {
          // Swallow: best-effort release, stale detection covers the rest
        }
      }
    }
  }

  const deadline = Date.now() + timeoutMs
  let announced = false

  for (;;) {
    if (exclusive) {
      // Ordered acquisition (slot 0 first) so two exclusive waiters cannot deadlock.
      while (claimed.length < total && tryClaim(files[claimed.length], holder, maxHoldMs)) {
        claimed.push(files[claimed.length])
      }
      if (claimed.length === total) break
    } else {
      const free = files.find((file) => tryClaim(file, holder, maxHoldMs))
      if (free) {
        claimed.push(free)
        break
      }
    }

    if (Date.now() >= deadline) {
      release()
      const err = new Error(`[cpu-slot] Timed out after ${Math.round(timeoutMs / 60_000)} min waiting for a CPU slot.`)
      err.code = "SLOT_TIMEOUT"
      throw err
    }

    if (!announced) {
      announced = true
      const busy = describeHolders(files.filter((f) => !claimed.includes(f)))
      log(`[cpu-slot] Waiting for ${exclusive ? "every CPU slot" : "a CPU slot"} (${total} total). Held by:`)
      for (const line of busy) log(`[cpu-slot]   ${line}`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  if (announced) log(`[cpu-slot] Slot acquired.`)
  return release
}

/** Releases on every way the process can end, so a crash never leaves a live-looking slot. */
export function releaseOnExit(release) {
  process.on("exit", release)
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
    process.on(signal, () => {
      release()
      process.exit(code)
    })
  }
}
