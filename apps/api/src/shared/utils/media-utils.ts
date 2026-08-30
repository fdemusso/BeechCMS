// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Media utils: estrazione chiavi R2 dal data di un'entry.
 * Usato alla cancellazione entry per eliminare i file associati da R2.
 *
 * @see docs/media-engine.md
 */
import type { Seed } from '@beechcms/core'

/** Pattern per estrarre la chiave R2 da URL in formato /api/media/KEY */
const MEDIA_URL_PATTERN = /\/api\/media\/([^?#\s"'`<>()[\]{}]+)/
const MEDIA_URL_GLOBAL_PATTERN = /\/api\/media\/([^?#\s"'`<>()[\]{}]+)/g

function safeDecodeKey(rawKey: string): string | null {
  try {
    return decodeURIComponent(rawKey)
  } catch {
    return null
  }
}

/**
 * Estrae la chiave R2 da un URL di media.
 * Es: "https://x.com/api/media/1739123456-avatar.png" → "1739123456-avatar.png"
 *
 * @param mediaUrl - URL completo o path (es. /api/media/123-foto.png)
 * @param cdnUrl - URL CDN opzionale configurato
 * @returns Chiave R2 o null se l'URL non è valido
 */
export function extractMediaKey(mediaUrl: string, cdnUrl?: string): string | null {
  const urlStr = String(mediaUrl)

  if (cdnUrl) {
    try {
      const cdnParsed = new URL(cdnUrl)
      const cdnOrigin = cdnParsed.origin
      const cdnPathPrefix = cdnParsed.pathname.replace(/\/+$/, '')
      const cdnPrefix = `${cdnOrigin}${cdnPathPrefix}/`
      const escapedPrefix = cdnPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const cdnRegex = new RegExp(`${escapedPrefix}+([^?#\\s"'\`<>()[\\\\\\]{}]+)`)
      const match = cdnRegex.exec(urlStr)
      if (match) {
        const key = match[1].replace(/^\/+/, '')
        return key ? safeDecodeKey(key) : null
      }
    } catch {
      // invalid cdnUrl, fall through to pattern match
    }
  }

  const match = MEDIA_URL_PATTERN.exec(urlStr)
  return match ? safeDecodeKey(match[1]) : null
}

/**
 * Attraversa ricorsivamente un valore (stringa, array, oggetto) e raccoglie
 * tutte le chiavi R2 trovate in stringhe che matchano /api/media/KEY.
 */
function collectMediaKeysRecursive(value: unknown, collectedKeys: Set<string>, cdnUrl?: string): void {
  if (typeof value === 'string') {
    // Legacy compat: campi json/file possono contenere JSON serializzato.
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed !== value && typeof parsed === 'object' && parsed !== null) {
        collectMediaKeysRecursive(parsed, collectedKeys, cdnUrl)
        return
      }
    } catch {
      // ignore
    }

    if (cdnUrl) {
      try {
        const cdnParsed = new URL(cdnUrl)
        const cdnOrigin = cdnParsed.origin
        const cdnPathPrefix = cdnParsed.pathname.replace(/\/+$/, '')
        const cdnPrefix = `${cdnOrigin}${cdnPathPrefix}/`
        const escapedPrefix = cdnPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const cdnRegex = new RegExp(`${escapedPrefix}+([^?#\\s"'\`<>()[\\\\\\]{}]+)`, 'g')
        for (const match of value.matchAll(cdnRegex)) {
          const key = safeDecodeKey(match[1].replace(/^\/+/, ''))
          if (key) collectedKeys.add(key)
        }
      } catch {
        // ignore invalid cdnUrl
      }
    }

    for (const match of value.matchAll(MEDIA_URL_GLOBAL_PATTERN)) {
      const key = safeDecodeKey(match[1])
      if (key) collectedKeys.add(key)
    }

    const singleKey = extractMediaKey(value, cdnUrl)
    if (singleKey) {
      collectedKeys.add(singleKey)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaKeysRecursive(item, collectedKeys, cdnUrl)
    return
  }
  if (value != null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      collectMediaKeysRecursive(nestedValue, collectedKeys, cdnUrl)
    }
  }
}

/**
 * Estrae tutte le chiavi R2 dal data di un'entry.
 * Cerca nei campi `file` (stringa URL), `json` (array/oggetto con URL) e `repeater` (array di record).
 * Il data è in formato DB o deserializzato (chiavi = branch alias).
 *
 * @param seed - Schema del tipo di contenuto
 * @param entryData - Payload (chiavi = branch alias)
 * @param cdnUrl - URL CDN opzionale configurato
 * @returns Array di chiavi R2 uniche da eliminare
 */
export function extractMediaKeysFromData(
  seed: Seed,
  entryData: Record<string, unknown>,
  cdnUrl?: string
): string[] {
  const r2Keys = new Set<string>()
  for (const branch of seed.branches) {
    if (branch.type !== 'file' && branch.type !== 'json' && branch.type !== 'repeater') continue
    const fieldValue = Object.hasOwn(entryData, branch.alias) ? entryData[branch.alias] : undefined
    if (fieldValue == null) continue
    collectMediaKeysRecursive(fieldValue, r2Keys, cdnUrl)
  }
  return [...r2Keys]
}
