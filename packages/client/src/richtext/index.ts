// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { renderRichText, normalizeRichtextDocument } from './render.js'
export { richTextToPlainText } from './plain-text.js'
export { escapeHtml, stripControlChars, isSafeUrl } from './escape.js'
export { RICHTEXT_SCHEMA_VERSION } from './types.js'
export type {
  TipTapDoc,
  TipTapNode,
  TipTapMark,
  TipTapMarkType,
  RichtextEnvelopeV1,
} from './types.js'

// Aliases
export { renderRichText as renderRichTextHtml } from './render.js'
export { richTextToPlainText as extractPlainText } from './plain-text.js'
