// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { ContentViewConfig } from "@beechcms/core"
import { useUpdateContentView } from "./use-content-views"

/** Long enough to coalesce typing in a filter pill, short enough that a reload rarely loses a change. */
export const VIEW_AUTOSAVE_DELAY_MS = 600

interface UseViewConfigAutosaveOptions {
  slug: string
  viewId: string
  config: ContentViewConfig
  /** false for users without content:update: changes stay local, as before persisted views. */
  enabled: boolean
}

export function useViewConfigAutosave({ slug, viewId, config, enabled }: UseViewConfigAutosaveOptions) {
  const { mutate, isPending } = useUpdateContentView(slug)
  const serialized = React.useMemo(() => JSON.stringify(config), [config])

  // Baseline = the config at mount, so hydrating a view never writes it back.
  const savedRef = React.useRef(serialized)
  const latestRef = React.useRef({ config, serialized, enabled })
  React.useLayoutEffect(() => {
    latestRef.current = { config, serialized, enabled }
  })

  const flush = React.useCallback(() => {
    const latest = latestRef.current
    if (!latest.enabled || latest.serialized === savedRef.current) return
    savedRef.current = latest.serialized
    mutate({ viewId, body: { config: latest.config } })
  }, [mutate, viewId])

  React.useEffect(() => {
    if (!enabled || serialized === savedRef.current) return
    const timer = setTimeout(flush, VIEW_AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [serialized, enabled, flush])

  // The caller is keyed by view id, so unmount means a view switch or leaving the page:
  // a change still inside the debounce window is flushed, never dropped.
  const flushRef = React.useRef(flush)
  React.useLayoutEffect(() => {
    flushRef.current = flush
  })
  React.useEffect(() => () => flushRef.current(), [])

  return { isSaving: isPending }
}
