// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { CSSProperties } from 'react'

export const DEFAULT_HONEYPOT_NAME = 'fax_number'
export const HONEYPOT_DECOYS = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot'] as const

export const HONEYPOT_CONTAINER_STYLE: CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  top: '-9999px',
  width: '1px',
  height: '1px',
  opacity: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
}
