// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESOURCES_DIR = join(__dirname, '..', 'resources')

export interface ResourceEntry {
  uri: string
  title: string
  description: string
  file: string
}

let cachedManifest: ResourceEntry[] | null = null
let cachedManifestMtime = 0

/** Clears the cached resource manifest. */
export function clearResourceCache(): void {
  cachedManifest = null
  cachedManifestMtime = 0
}

/** Returns the number of bundled resources currently loaded. */
export function getResourceCount(): number {
  return loadManifest().length
}

function loadManifest(): ResourceEntry[] {
  const manifestPath = join(RESOURCES_DIR, 'manifest.json')
  try {
    let mtime = 0
    try {
      mtime = typeof statSync === 'function' ? (statSync(manifestPath)?.mtimeMs ?? 0) : 0
    } catch {}

    if (cachedManifest && (mtime === 0 || cachedManifestMtime === mtime)) {
      return cachedManifest
    }
    const raw = readFileSync(manifestPath, 'utf8')
    cachedManifest = JSON.parse(raw) as ResourceEntry[]
    cachedManifestMtime = mtime
    return cachedManifest
  } catch (err) {
    if (cachedManifest) return cachedManifest
    throw err
  }
}

/** Lists all bundled MCP resources (title + description only, no file content). */
export function listResources(): { uri: string; name: string; description: string; mimeType: string }[] {
  return loadManifest().map(entry => ({
    uri: entry.uri,
    name: entry.title,
    description: entry.description,
    mimeType: 'text/markdown',
  }))
}

/** Reads the full text content of a single resource by URI. Throws if the URI is unknown. */
export function readResource(uri: string): { uri: string; mimeType: string; text: string } {
  const entry = loadManifest().find(e => e.uri === uri)
  if (!entry) throw new Error(`Unknown resource URI '${uri}'.`)
  const text = readFileSync(join(RESOURCES_DIR, entry.file), 'utf8')
  return { uri: entry.uri, mimeType: 'text/markdown', text }
}
