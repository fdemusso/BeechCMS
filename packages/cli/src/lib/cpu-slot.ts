// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Surface of scripts/lib/cpu-slot.mjs used by the CLI. */
export interface CpuSlotModule {
  acquireCpuSlot(options: { exclusive: boolean; label: string }): Promise<() => void>
  releaseOnExit(release: () => void): void
  HELD_ENV: string
  EXIT_SLOT_TIMEOUT: number
}

/**
 * Machine-wide CPU slot shared by every worktree. The policy lives in scripts/lib/cpu-slot.mjs;
 * this bundled package loads it from the repo at runtime and returns null outside the monorepo.
 */
export async function loadCpuSlot(cwd: string): Promise<CpuSlotModule | null> {
  const modulePath = resolve(cwd, 'scripts', 'lib', 'cpu-slot.mjs')
  if (!existsSync(modulePath)) return null
  return (await import(pathToFileURL(modulePath).href)) as CpuSlotModule
}
