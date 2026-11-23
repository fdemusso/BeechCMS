// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI_PACKAGE_NAME = '@beechcms/cli'

/**
 * Version of the running `@beechcms/cli`. Walks up from this module to the first matching `package.json`,
 * so it works from `src/` (vitest) and from the bundled `dist/index.js`.
 */
export function readCliVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const manifestPath = join(directory, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string }
      if (manifest.name === CLI_PACKAGE_NAME && manifest.version) return manifest.version
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Cannot locate the ${CLI_PACKAGE_NAME} package.json`)
    directory = parent
  }
}
