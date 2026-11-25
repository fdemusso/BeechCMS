// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESOURCES_DIR = join(__dirname, '..', 'resources')

interface ResourceEntry {
  uri: string
  title: string
  description: string
  keywords?: string[]
  file: string
}

let cachedManifest: ResourceEntry[] | null = null
let cachedManifestMtime = 0
const cachedContents = new Map<string, string>()

/** Clears the cached resource manifest and file contents. */
export function clearResourceCache(): void {
  cachedManifest = null
  cachedManifestMtime = 0
  cachedContents.clear()
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
    cachedContents.clear()
    return cachedManifest
  } catch (err) {
    if (cachedManifest) return cachedManifest
    const isEnoent =
      (err as NodeJS.ErrnoException)?.code === 'ENOENT' ||
      (err instanceof Error && (err.message.includes('ENOENT') || err.message.includes('no such file')))
    if (isEnoent) {
      return []
    }
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

function readCachedContent(file: string): string | null {
  const cached = cachedContents.get(file)
  if (cached !== undefined) return cached
  try {
    const text = readFileSync(join(RESOURCES_DIR, file), 'utf8')
    cachedContents.set(file, text)
    return text
  } catch {
    return null
  }
}

/** Reads the full text content of a single resource by URI. Throws if the URI is unknown. */
export function readResource(uri: string): { uri: string; mimeType: string; text: string } {
  const entry = loadManifest().find(e => e.uri === uri)
  if (!entry) throw new Error(`Unknown resource URI '${uri}'.`)
  const text = readCachedContent(entry.file)
  if (text === null) throw new Error(`Resource file missing for URI '${uri}'.`)
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

export interface ResourceSearchOptions {
  /** 'and' (default) requires every token to match; 'any' matches any token; 'fallback' returns AND hits first and fills up to limit with partial matches in one pass. */
  matchMode?: 'and' | 'any' | 'fallback'
}

/**
 * Full-text search over the bundled resource corpus (title, keywords, description, file content).
 * The query is split into whitespace-separated tokens; in 'and' mode a resource must contain
 * every token (case-insensitive substring) somewhere across title/keywords/description/content.
 * Scoring is a weighted sum per token: title (+100), keywords (+40), description (+20), content (+2 * occ).
 */
export function searchResources(query: string, limit = 10, options: ResourceSearchOptions = {}): ResourceSearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const matchMode = options.matchMode ?? 'and'

  const andHits: ResourceSearchHit[] = []
  const partialHits: Array<ResourceSearchHit & { matchedTokens: number }> = []

  for (const entry of loadManifest()) {
    const titleLower = entry.title.toLowerCase()
    const keywordsLower = (entry.keywords ?? []).join(' ').toLowerCase()
    const descLower = entry.description.toLowerCase()

    const content = readCachedContent(entry.file)
    if (content === null) continue
    const contentLower = content.toLowerCase()

    let score = 0
    let matchedTokens = 0
    let firstMatchToken: string | undefined
    for (const token of tokens) {
      const titleMatch = titleLower.includes(token)
      const keywordMatch = keywordsLower.includes(token)
      const descMatch = descLower.includes(token)
      const contentOccurrences = contentLower.split(token).length - 1
      if (!titleMatch && !keywordMatch && !descMatch && contentOccurrences === 0) {
        if (matchMode === 'and') {
          matchedTokens = -1
          break
        }
        continue
      }
      matchedTokens += 1
      if (firstMatchToken === undefined) {
        firstMatchToken = token
      }
      score += (titleMatch ? 100 : 0) + (keywordMatch ? 40 : 0) + (descMatch ? 20 : 0) + Math.min(contentOccurrences, 10) * 2
    }
    if (matchedTokens <= 0) continue

    const baseHit: ResourceSearchHit = {
      uri: entry.uri,
      title: entry.title,
      description: entry.description,
      score,
      snippet: buildSnippet(content, firstMatchToken ?? tokens[0]),
    }

    if (matchedTokens === tokens.length) {
      andHits.push(baseHit)
    } else if (matchMode === 'any' || matchMode === 'fallback') {
      partialHits.push({ ...baseHit, score: matchedTokens * 1000 + score, matchedTokens })
    }
  }

  andHits.sort((a, b) => b.score - a.score || a.uri.localeCompare(b.uri))
  if (matchMode === 'and') return andHits.slice(0, limit)

  partialHits.sort((a, b) => b.score - a.score || a.uri.localeCompare(b.uri))
  if (matchMode === 'any') {
    const combined = [
      ...andHits.map(hit => ({ ...hit, score: tokens.length * 1000 + hit.score })),
      ...partialHits.map(({ matchedTokens: _, ...hit }) => hit),
    ]
    combined.sort((a, b) => b.score - a.score || a.uri.localeCompare(b.uri))
    return combined.slice(0, limit)
  }

  // 'fallback': exact AND matches first, then partial matches up to limit
  return [
    ...andHits,
    ...partialHits.map(({ matchedTokens: _, ...hit }) => hit),
  ].slice(0, limit)
}
