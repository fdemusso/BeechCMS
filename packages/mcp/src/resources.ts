// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { readFileSync } from 'node:fs'
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

function loadManifest(): ResourceEntry[] {
  if (cachedManifest) return cachedManifest
  const raw = readFileSync(join(RESOURCES_DIR, 'manifest.json'), 'utf8')
  cachedManifest = JSON.parse(raw) as ResourceEntry[]
  return cachedManifest
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
