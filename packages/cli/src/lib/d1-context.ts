// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/d1-context
 * Resolves "which D1 am I reading, and through what executor" once, for every schema command.
 *
 * Commands must not re-derive this: a `beech schema diff` that resolved a different database than
 * `beech types generate` would report drift that does not exist.
 */

import pc from 'picocolors'
import type { Seed, SchemaQueryExecutor } from '@beechcms/core'
import { introspectSeedDefinitions } from '@beechcms/core'
import {
  findWranglerConfig,
  resolveDbName,
  getLocalD1SqlitePath,
  type WranglerOptions,
} from './wrangler.js'
import { createWranglerExecutor } from './d1-executor.js'

/** A failure with an operator-facing remedy already attached. */
export class CliError extends Error {
  constructor(message: string, readonly hint?: string, readonly cause?: unknown) {
    super(message)
    this.name = 'CliError'
  }
}

/** Flags every schema command shares. */
export interface D1ContextOptions {
  /** Target the local miniflare SQLite state. Default: true. */
  local?: boolean
  /** Override the D1 database name resolved from `wrangler.jsonc`. */
  db?: string
}

/** The resolved target plus the executor `@beechcms/core`'s primitive reads through. */
export interface D1Context {
  executor: SchemaQueryExecutor
  options: WranglerOptions
}

/** Resolves the wrangler target and wraps it in the executor the introspection primitive expects. */
export function createD1Context(args: D1ContextOptions = {}): D1Context {
  const local = args.local !== false
  const configPath = findWranglerConfig()
  const db = args.db ?? resolveDbName(configPath)

  if (local && !getLocalD1SqlitePath()) {
    throw new CliError(
      'Local D1 database state not found.',
      'Start the local environment with `beech dev`, or initialize it with `beech init --db`.',
    )
  }

  const options: WranglerOptions = { db, local, configPath }
  return { executor: createWranglerExecutor(options), options }
}

/**
 * Reads every active seed definition through the shared primitive.
 *
 * `introspectSeedDefinitions` wraps the driver failure in an `IntrospectionError`, so the
 * recognisable "no such table" text lives on the CAUSE, not on the message — an uninitialized
 * database is the most common failure here and deserves its own remedy rather than a stack trace.
 */
export async function loadLiveSeeds(context: D1Context): Promise<Seed[]> {
  let seeds: Seed[]
  try {
    seeds = await introspectSeedDefinitions(context.executor)
  } catch (error) {
    const detail = describeCause(error)
    if (detail.includes('no such table: seeds')) {
      throw new CliError(
        'System table `seeds` not found in the database.',
        'Run `beech init --db` or `beech onboard` to create the system tables.',
        error,
      )
    }
    throw new CliError(
      `Failed to introspect D1 database (${context.options.db}): ${detail}`,
      undefined,
      error,
    )
  }

  if (seeds.length === 0) {
    throw new CliError(
      `No active seeds found in D1 database (${context.options.db}).`,
      'Create a content type in the dashboard (/admin) or through POST /api/seeds.',
    )
  }

  return seeds
}

/** Flattens an error and its cause chain into one searchable string. */
function describeCause(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    parts.push(current.message)
    current = (current as { cause?: unknown }).cause
  }
  if (parts.length === 0) parts.push(String(error))
  return parts.join(' — ')
}

/** Renders a failure the way every other command does, then terminates with a non-zero status. */
export function exitWithError(error: unknown): never {
  if (error instanceof CliError) {
    console.error(pc.red(`\n  ✗ ${error.message}`) + (error.hint ? pc.gray(`\n    ${error.hint}\n`) : '\n'))
  } else {
    console.error(pc.red(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`))
  }
  process.exit(1)
}
