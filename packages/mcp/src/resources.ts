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

export interface ResourceSearchHit {
  uri: string
  title: string
  description: string
  score: number
  snippet: string
}

/** Builds a short excerpt around the first query match in `text`, or the start of the text if none. */
function buildSnippet(text: string, query: string, radius = 100): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, radius * 2).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix
}

/**
 * Full-text search over the bundled resource corpus (title, description, file content).
 * The query is split into whitespace-separated tokens; a resource must contain every token
 * (case-insensitive substring, AND logic) somewhere across title/description/content to match —
 * a single-phrase substring search would miss any resource that doesn't repeat the exact typed
 * phrase verbatim. Scoring is a simple weighted sum per token: title hits rank highest, then
 * description, then content occurrence count. No external index; scans the manifest and reads
 * each candidate file directly, which is fine at this corpus size (low hundreds of short
 * markdown files, rebuilt on every build).
 */
export function searchResources(query: string, limit = 10): ResourceSearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const hits: ResourceSearchHit[] = []
  for (const entry of loadManifest()) {
    const titleLower = entry.title.toLowerCase()
    const descLower = entry.description.toLowerCase()

    let content = ''
    try {
      content = readFileSync(join(RESOURCES_DIR, entry.file), 'utf8')
    } catch {
      continue
    }
    const contentLower = content.toLowerCase()

    let score = 0
    let matchedAllTokens = true
    let firstMatchToken: string | undefined
    for (const token of tokens) {
      const titleMatch = titleLower.includes(token)
      const descMatch = descLower.includes(token)
      const contentOccurrences = contentLower.split(token).length - 1
      if (!titleMatch && !descMatch && contentOccurrences === 0) {
        matchedAllTokens = false
        break
      }
      if (firstMatchToken === undefined && (titleMatch || descMatch || contentOccurrences > 0)) {
        firstMatchToken = token
      }
      score += (titleMatch ? 100 : 0) + (descMatch ? 20 : 0) + Math.min(contentOccurrences, 10) * 2
    }
    if (!matchedAllTokens) continue

    hits.push({
      uri: entry.uri,
      title: entry.title,
      description: entry.description,
      score,
      snippet: buildSnippet(content, firstMatchToken ?? tokens[0]),
    })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
