// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const idOf = (value: unknown): string | undefined =>
  isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined

/**
 * `next` with every part that did not change replaced by the object it already was in `prev`.
 *
 * The builders edit a deep clone of the layout, so after every change each section, column and widget is a new
 * object even when nothing in it changed, and a memoised block can never skip a redraw. Handing back the old
 * reference for what is equal restores that: only the parts that really changed get a new identity. Array items
 * that carry an `id` are matched by it, so a neighbour that merely shifted position keeps its identity too.
 */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === next) return next

  if (Array.isArray(prev) && Array.isArray(next)) {
    const prevById = new Map<string, unknown>()
    for (const item of prev) {
      const id = idOf(item)
      if (id !== undefined) prevById.set(id, item)
    }
    let unchanged = prev.length === next.length
    const shared = next.map((item, index) => {
      const id = idOf(item)
      const counterpart = id !== undefined ? prevById.get(id) : prev[index]
      const result = shareStructure(counterpart, item)
      if (result !== prev[index]) unchanged = false
      return result
    })
    return (unchanged ? prev : shared) as T
  }

  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = Object.keys(next)
    let unchanged = keys.length === Object.keys(prev).length
    const shared: Record<string, unknown> = {}
    for (const key of keys) {
      const result = shareStructure(prev[key], next[key])
      shared[key] = result
      if (!(key in prev) || result !== prev[key]) unchanged = false
    }
    return (unchanged ? prev : shared) as T
  }

  return next
}
