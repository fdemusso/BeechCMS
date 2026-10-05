#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Runs one CPU-heavy command inside a machine-wide CPU slot (see scripts/lib/cpu-slot.mjs).
//
// Usage (from a checkout or worktree root):
//   node scripts/cpu-slot.mjs [--exclusive] [--label <text>] -- <command> [args...]
//
// Examples:
//   node scripts/cpu-slot.mjs -- pnpm --filter @beechcms/api exec vitest run src/x/y.test.ts
//   node scripts/cpu-slot.mjs -- pnpm turbo run type-check lint --filter=...[origin/devs] --concurrency=2
//   node scripts/cpu-slot.mjs --exclusive -- pnpm --filter @beechcms/api exec vitest run --project flow
//
// Inside the slot the command also gets:
//   - below-normal process priority (inherited by the whole child tree);
//   - VITEST_MAX_WORKERS capped to the local budget split across slots (unless already set);
//   - TURBO_CACHE_DIR pointing at the main checkout's .turbo/cache (unless already set), so a
//     fresh worktree's build and pre-commit `docs:generate` replay cached outputs instead of
//     recompiling the monorepo.
//
// Exit code: the command's own, or 75 when the slot wait times out. 0 always means the command
// ran and succeeded — never "skipped".

import { execSync } from "node:child_process"
import path from "node:path"
import { execa } from "execa"
import { acquireCpuSlot, releaseOnExit, slotCount, HELD_ENV, EXIT_SLOT_TIMEOUT } from "./lib/cpu-slot.mjs"
import { resolveTestResources, lowerProcessPriority } from "./lib/test-resources.mjs"

const argv = process.argv.slice(2)
const separator = argv.indexOf("--")
if (separator === -1 || separator === argv.length - 1) {
  console.error("Usage: node scripts/cpu-slot.mjs [--exclusive] [--label <text>] -- <command> [args...]")
  process.exit(2)
}

const options = argv.slice(0, separator)
const [command, ...args] = argv.slice(separator + 1)
const labelIndex = options.indexOf("--label")
const label = labelIndex !== -1 ? options[labelIndex + 1] : [command, ...args].join(" ")

// The flow tier shares one Docker stack (MinIO bucket, Mailpit inbox, webhook-tester) across
// every worktree, so it is exclusive even when the caller forgets to say so.
const touchesFlowTier = args.some((arg) => /(^|[=:,\s])flow($|[,\s])/.test(arg) || /(^|[\\/])apps[\\/]api[\\/]test[\\/]/.test(arg))
const exclusive = options.includes("--exclusive") || touchesFlowTier

function sharedTurboCacheDir() {
  try {
    const commonDir = execSync("git rev-parse --path-format=absolute --git-common-dir", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    return path.join(path.dirname(commonDir), ".turbo", "cache")
  } catch {
    return undefined
  }
}

let release
try {
  release = await acquireCpuSlot({ exclusive, label })
} catch (err) {
  if (err.code !== "SLOT_TIMEOUT") throw err
  console.error(err.message)
  console.error("[cpu-slot] The command did NOT run. Retry later; this is not a test result.")
  process.exit(EXIT_SLOT_TIMEOUT)
}
releaseOnExit(release)

const resources = resolveTestResources()
if (resources) lowerProcessPriority()

const env = { ...process.env, [HELD_ENV]: "1" }
if (resources && !env.VITEST_MAX_WORKERS) {
  const slots = exclusive ? 1 : slotCount()
  env.VITEST_MAX_WORKERS = String(Math.max(1, Math.floor(resources.vitestWorkers / slots)))
}
const turboCacheDir = env.TURBO_CACHE_DIR ?? sharedTurboCacheDir()
if (turboCacheDir) env.TURBO_CACHE_DIR = turboCacheDir

const result = await execa(command, args, { stdio: "inherit", reject: false, env })
if (result.exitCode === undefined) console.error(`[cpu-slot] ${result.shortMessage}`)
release()
process.exit(result.exitCode ?? 1)
