// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Local-only CPU/memory budget for test runs (thermal & responsiveness protection).
// Single source of truth for scripts/test-runner.mjs, scripts/test-coverage-diff.mjs and
// `beech test` (packages/cli/src/commands/test.ts loads this file from the repo at runtime).
//
// CI runners are dedicated machines: when CI is set the budget is skipped entirely and
// Turbo/Vitest keep their own defaults.
//
// Budget = min(half the logical CPUs, one worker per 2GB RAM), split across Turbo packages:
//   Ryzen 5800X3D (16 threads, 32GB) → budget 8 → 2 packages × 4 Vitest workers
//   MacBook Air   (8 cores,     8GB) → budget 4 → 2 packages × 2 Vitest workers
//
// Overrides: BEECH_TEST_WORKERS (total budget), TURBO_CONCURRENCY / BEECH_MAX_CONCURRENCY,
// VITEST_MAX_WORKERS (per package), BEECH_TEST_THROTTLE=0 (disable locally).

import os from "node:os"

const positiveInt = (value) => {
  const n = Number.parseInt(value ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * @returns {null | { cpus: number, totalMemGb: number, budget: number, turboConcurrency: number, vitestWorkers: number }}
 *   null when no throttling applies (CI or explicitly disabled).
 */
export function resolveTestResources({
  env = process.env,
  cpus = os.availableParallelism?.() ?? os.cpus().length,
  totalMemGb = os.totalmem() / 1024 ** 3,
} = {}) {
  if (env.CI || env.BEECH_TEST_THROTTLE === "0") return null

  const cpuBudget = Math.max(2, Math.floor(cpus / 2))
  const memBudget = Math.max(2, Math.floor(totalMemGb / 2))
  const budget = positiveInt(env.BEECH_TEST_WORKERS) ?? Math.min(cpuBudget, memBudget)

  const turboConcurrency =
    positiveInt(env.TURBO_CONCURRENCY) ?? positiveInt(env.BEECH_MAX_CONCURRENCY) ?? Math.min(2, budget)
  const vitestWorkers =
    positiveInt(env.VITEST_MAX_WORKERS) ?? Math.max(1, Math.floor(budget / turboConcurrency))

  return { cpus, totalMemGb: Math.round(totalMemGb), budget, turboConcurrency, vitestWorkers }
}

/** Env vars that make every Vitest process honour the per-package worker cap. */
export function testResourceEnv(resources) {
  return resources ? { VITEST_MAX_WORKERS: String(resources.vitestWorkers) } : {}
}

/**
 * Drops the current process to below-normal priority. Children inherit it (nice on POSIX,
 * BELOW_NORMAL_PRIORITY_CLASS on Windows), so the whole Turbo → Vitest → worker tree yields
 * to the desktop instead of freezing it.
 */
export function lowerProcessPriority() {
  try {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    // Swallow: priority is a best-effort nicety, never a reason to fail the run
  }
}

export function describeTestResources(resources) {
  if (!resources) return "Thermal Protection off (CI or BEECH_TEST_THROTTLE=0)"
  const { cpus, totalMemGb, budget, turboConcurrency, vitestWorkers } = resources
  return `Thermal Protection: ${cpus} CPUs, ${totalMemGb}GB RAM → budget ${budget} | Turbo concurrency=${turboConcurrency}, Vitest workers=${vitestWorkers}/package, priority=below-normal`
}
