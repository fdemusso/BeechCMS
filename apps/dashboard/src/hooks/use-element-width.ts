// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'

/**
 * The content width of an element, kept up to date while it is mounted. Returns a callback ref (attach it to the
 * element) and the width, `undefined` until the first measurement. A callback ref rather than an effect on a ref
 * object: the element may mount after the hook first runs.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = React.useState<number | undefined>()
  const observerRef = React.useRef<ResizeObserver | null>(null)

  const ref = React.useCallback((node: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    setWidth(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])

  return { ref, width }
}
