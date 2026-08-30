// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const RICHTEXT_SCHEMA_VERSION = 1 as const

export interface RichtextEnvelopeV1 {
  schemaVersion: typeof RICHTEXT_SCHEMA_VERSION
  doc: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type TipTapMarkType =
  | 'bold'
  | 'strong'
  | 'italic'
  | 'em'
  | 'strike'
  | 's'
  | 'underline'
  | 'u'
  | 'code'
  | 'highlight'
  | 'superscript'
  | 'subscript'
  | 'textStyle'
  | 'link'
  | string

export interface TipTapMark {
  type: TipTapMarkType
  attrs?: Record<string, unknown>
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

export interface TipTapDoc {
  type: 'doc'
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
}
