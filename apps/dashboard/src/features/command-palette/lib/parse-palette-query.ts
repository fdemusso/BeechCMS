// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { CommandPage, PalettePrefix } from "../types"

/** Every routable prefix. `Record` makes tsc reject a `PalettePrefix` member missing here. */
export const PALETTE_PREFIXES: Readonly<Record<PalettePrefix, true>> = { "=": true }

export interface ParsedPaletteQuery {
  /** Absent when the query carries no prefix. */
  readonly prefix?: PalettePrefix
  /** The query without its prefix, trimmed. */
  readonly text: string
}

/** Splits a leading routing prefix off the raw input. Prefixes exist only on the root page. */
export function parsePaletteQuery(raw: string, page: CommandPage): ParsedPaletteQuery {
  const trimmed = raw.trim()
  if (page !== "root") return { text: trimmed }

  const first = trimmed.charAt(0)
  if (!Object.hasOwn(PALETTE_PREFIXES, first)) return { text: trimmed }

  return { prefix: first as PalettePrefix, text: trimmed.slice(1).trim() }
}
