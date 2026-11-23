// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Reads the package version from `../package.json`, which sits one level above both
 * `src/` (vitest) and `dist/` (bundled server). Never throws.
 *
 * @returns The package version, or `'0.0.0'` when the file cannot be read or parsed.
 */
export function readServerVersion(): string {
  try {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const version = (parsed as { version?: unknown }).version
    return typeof version === 'string' ? version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const MCP_SERVER_VERSION: string = readServerVersion()
