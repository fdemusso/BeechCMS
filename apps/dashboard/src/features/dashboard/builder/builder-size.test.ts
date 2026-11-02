// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { BUILDER_CHROME_PX, builderDialogWidth } from './builder-size'

describe('builderDialogWidth', () => {
  it('is the dashboard content width plus the builder\'s own padding', () => {
    const width = builderDialogWidth(1500)

    expect(width).toBe(`min(96vw, max(720px, ${1500 + BUILDER_CHROME_PX}px))`)
  })

  it('rounds a fractional measurement to whole pixels', () => {
    const width = builderDialogWidth(1200.6)

    expect(width).toContain(`${1201 + BUILDER_CHROME_PX}px`)
  })

  it('falls back to 80% of the window before the dashboard has been measured', () => {
    const width = builderDialogWidth(undefined)

    expect(width).toBe('80vw')
  })

  it('falls back to 80% of the window for a zero width, as a hidden dashboard reports', () => {
    const width = builderDialogWidth(0)

    expect(width).toBe('80vw')
  })
})
