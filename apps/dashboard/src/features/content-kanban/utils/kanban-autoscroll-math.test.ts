// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { scrollDelta } from './kanban-autoscroll-math'

const rect = { top: 100, bottom: 500 }
const EDGE_PX = 60
const SPEED = 8

describe('scrollDelta', () => {
  it('returns -speed when the pointer is within edgePx of the top edge', () => {
    expect(scrollDelta(120, rect, EDGE_PX, SPEED)).toBe(-SPEED)
  })

  it('returns +speed when the pointer is within edgePx of the bottom edge', () => {
    expect(scrollDelta(480, rect, EDGE_PX, SPEED)).toBe(SPEED)
  })

  it('returns 0 in the dead zone between the edges', () => {
    expect(scrollDelta(300, rect, EDGE_PX, SPEED)).toBe(0)
  })

  it('returns 0 at the exact top boundary (strict "<", not "<=")', () => {
    expect(scrollDelta(rect.top + EDGE_PX, rect, EDGE_PX, SPEED)).toBe(0)
  })

  it('returns 0 at the exact bottom boundary (strict "<", not "<=")', () => {
    expect(scrollDelta(rect.bottom - EDGE_PX, rect, EDGE_PX, SPEED)).toBe(0)
  })
})
