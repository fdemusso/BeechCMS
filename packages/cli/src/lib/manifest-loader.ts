// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-loader
 * Loads `beech.schema.ts` and hands back a validated `BeechSchemaManifest`.
 *
 * The file is imported through Node's own ESM loader, which strips TypeScript types natively from
 * Node 22.18 on. No bundler and no transpiler dependency: a manifest is plain declarative data, and
 * pulling esbuild into the CLI's runtime dependencies to read a data file fails YAGNI.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MANIFEST_VERSION, validateManifest } from '@beechcms/core/schema'
import type { BeechSchemaManifest } from '@beechcms/core/schema'
import type { SeedValidationIssue } from '@beechcms/core'

/** Where `beech schema export` writes, and where every command looks by default. */
export const DEFAULT_MANIFEST_PATH = 'beech.schema.ts'

/** A manifest that could not be read, or that read back as something unusable. */
export class ManifestLoadError extends Error {
  constructor(message: string, readonly issues: SeedValidationIssue[] = [], readonly cause?: unknown) {
    super(message)
    this.name = 'ManifestLoadError'
  }
}

/**
 * Turns an imported module namespace into a validated manifest.
 *
 * Split out of `loadManifest` on purpose: everything decidable without I/O is decided here, so the
 * rules (default export required, version gate, fatal validation) are unit-testable without a
 * filesystem (`testing_conventions.md` Rule 0.2).
 */
export function interpretManifestModule(module: unknown, path: string): BeechSchemaManifest {
  const candidate = (module as { default?: unknown } | null)?.default
  if (candidate === undefined) {
    throw new ManifestLoadError(
      `${path} has no default export. A manifest ends with \`export default defineSchema({ seeds: [...] })\`.`,
    )
  }
  if (typeof candidate !== 'object' || candidate === null) {
    throw new ManifestLoadError(`${path} default-exports a ${typeof candidate}, not a manifest object.`)
  }

  const manifest = candidate as Partial<BeechSchemaManifest>
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ManifestLoadError(
      `${path} declares manifest version ${String(manifest.version)}; this build understands ${MANIFEST_VERSION}.`,
    )
  }
  if (!Array.isArray(manifest.seeds)) {
    throw new ManifestLoadError(`${path} is missing a \`seeds\` array.`)
  }

  const complete = manifest as BeechSchemaManifest
  // Cross-seed rules (relation targets, reserved aliases, id/alias formats) can only be checked on
  // the whole set, which is why validation belongs here and not in `defineSeed`.
  const issues = validateManifest(complete)
  const fatal = issues.filter(issue => issue.fatal)
  if (fatal.length > 0) {
    throw new ManifestLoadError(
      `${path} is not a valid schema: ${fatal.flatMap(issue => issue.messages).join('; ')}`,
      issues,
    )
  }

  return complete
}

/**
 * Reads and validates the manifest at `path` (default `beech.schema.ts`, relative to the cwd).
 *
 * Node refuses to import a `.ts` file when type stripping is unavailable; that failure is mapped to
 * a remedy instead of a raw `ERR_UNKNOWN_FILE_EXTENSION`, because the operator's fix is a Node
 * upgrade and nothing in the message would otherwise say so.
 */
export async function loadManifest(path: string = DEFAULT_MANIFEST_PATH): Promise<BeechSchemaManifest> {
  const absolute = resolve(process.cwd(), path)
  if (!existsSync(absolute)) {
    throw new ManifestLoadError(
      `No manifest at ${path}. Produce one from the live database with \`beech schema export\`.`,
    )
  }

  let module: unknown
  try {
    module = await import(pathToFileURL(absolute).href)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ERR_UNKNOWN_FILE_EXTENSION' || code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING') {
      throw new ManifestLoadError(
        `This Node build cannot import ${path} directly (TypeScript type stripping unavailable).`,
        [],
        error,
      )
    }
    throw new ManifestLoadError(`${path} failed to load: ${(error as Error).message}`, [], error)
  }

  return interpretManifestModule(module, path)
}
