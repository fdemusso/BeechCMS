// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Layout does not exist in the test DOM, so the section's height is a variable the element reports, and the Web
 * Animations API is a spy: what is under test is when the ease starts and between which two heights.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnimatedSectionHeight } from './use-animated-section-height'

describe('useAnimatedSectionHeight', () => {
  let height: number
  let animate: ReturnType<typeof vi.fn>
  let section: HTMLDivElement

  function renderEasing(enabled = true) {
    const view = renderHook(({ dragging }) => useAnimatedSectionHeight(dragging, enabled), {
      initialProps: { dragging: false },
    })
    view.result.current.current = section
    return view
  }

  beforeEach(() => {
    height = 100
    animate = vi.fn()
    section = document.createElement('div')
    Object.defineProperty(section, 'offsetHeight', { configurable: true, get: () => height })
    Object.assign(section, { animate })
  })

  it('eases from the height at pick-up to the height at the drop', () => {
    const view = renderEasing()
    view.rerender({ dragging: true })
    height = 160

    view.rerender({ dragging: false })

    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledWith(
      [
        { height: '100px', overflow: 'hidden' },
        { height: '160px', overflow: 'hidden' },
      ],
      expect.objectContaining({ easing: 'ease-out' }),
    )
  })

  it('does not animate while the item is still in flight', () => {
    const view = renderEasing()
    view.rerender({ dragging: true })
    height = 160

    view.rerender({ dragging: true })

    expect(animate).not.toHaveBeenCalled()
  })

  it('does not animate when the section ends at the height it had', () => {
    const view = renderEasing()
    view.rerender({ dragging: true })

    view.rerender({ dragging: false })

    expect(animate).not.toHaveBeenCalled()
  })

  it('does not animate when it is switched off', () => {
    const view = renderEasing(false)
    view.rerender({ dragging: true })
    height = 160

    view.rerender({ dragging: false })

    expect(animate).not.toHaveBeenCalled()
  })
})
