// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { localStatePathHint, WINDOWS_LOCAL_STATE_PATH_LIMIT } from '../lib/path-limits.js'

describe('localStatePathHint', () => {
  const deepPath = 'C:/' + 'a'.repeat(WINDOWS_LOCAL_STATE_PATH_LIMIT)

  it('explains the opaque wrangler error for a deep project path on Windows', () => {
    const hint = localStatePathHint(deepPath, 'win32')

    expect(hint).toContain('internal error')
    expect(hint).toContain(String(deepPath.length))
  })

  it('stays silent for a short path on Windows', () => {
    const hint = localStatePathHint('C:/dev/my-app', 'win32')

    expect(hint).toBeNull()
  })

  it('stays silent for a deep path on a platform without the 260 character limit', () => {
    const hint = localStatePathHint(deepPath, 'linux')

    expect(hint).toBeNull()
  })
})
