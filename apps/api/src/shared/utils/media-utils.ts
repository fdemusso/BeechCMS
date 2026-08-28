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
const MEDIA_URL_PATTERN = /\/api\/media\/([^?#]+)/

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
      const cdnOrigin = new URL(cdnUrl).origin
      const mediaUrlParsed = new URL(urlStr)
      if (mediaUrlParsed.origin === cdnOrigin) {
        const keyPart = mediaUrlParsed.pathname.replace(/^\/+/, '')
        return keyPart ? decodeURIComponent(keyPart) : null
      }
    } catch {
      // mediaUrl not absolute or cdnUrl invalid, fall through to pattern match
    }
  }

  const match = MEDIA_URL_PATTERN.exec(urlStr)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Attraversa ricorsivamente un valore (stringa, array, oggetto) e raccoglie
 * tutte le chiavi R2 trovate in stringhe che matchano /api/media/KEY.
 */
function collectMediaKeysRecursive(value: unknown, collectedKeys: Set<string>, cdnUrl?: string): void {
  if (typeof value === 'string') {
    const r2Key = extractMediaKey(value, cdnUrl)
    if (r2Key) {
      collectedKeys.add(r2Key)
      return
    }
    // Legacy compat: campi json/file possono contenere JSON serializzato.
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed !== value) {
        collectMediaKeysRecursive(parsed, collectedKeys, cdnUrl)
      }
    } catch {
      // ignore
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
 * Cerca nei campi `file` (stringa URL) e `json` (array/oggetto con URL).
 * Il data è in formato DB: chiavi = branch.id (es. art_03, prd_05).
 *
 * @param seed - Schema del tipo di contenuto
 * @param entryData - Payload in formato DB (chiavi = branch ID)
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
    if (branch.type !== 'file' && branch.type !== 'json') continue
    const fieldValue = Object.hasOwn(entryData, branch.alias) ? entryData[branch.alias] : undefined
    if (fieldValue == null) continue
    collectMediaKeysRecursive(fieldValue, r2Keys, cdnUrl)
  }
  return [...r2Keys]
}
