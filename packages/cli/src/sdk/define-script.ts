// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/define-script
 * Typing helper for scripts run by `beech run`.
 */

import type { BeechSdk, SeedRegistryShape } from './types.js'

export interface ScriptContext {
  /** `--arg k=v` pairs, in command-line order; values are always strings. */
  readonly args: Readonly<Record<string, string>>
  /** Appends one line to the report's `logs`. Parts are joined by one space; non-strings are JSON-encoded. */
  log(...parts: unknown[]): void
  /** True under `beech run --dry-run`: non-read calls return `{ kind: 'dry-run' }` and send nothing. */
  readonly dryRun: boolean
}

/** A script's default export. Its return value becomes `RunReport.result` (must be JSON-serializable). */
export type BeechScript<R = SeedRegistryShape> = (beech: BeechSdk<R>, context: ScriptContext) => unknown

/** Identity at runtime; exists to type `beech` with the project's `SeedRegistryTypes`. */
export function defineScript<R = SeedRegistryShape>(script: BeechScript<R>): BeechScript<R> {
  return script
}
