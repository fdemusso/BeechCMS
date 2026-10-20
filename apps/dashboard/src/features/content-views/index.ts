// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public API of the content-views slice: persisted, shared view instances of a content type.
 * Imports no other feature slice. Pages compose it with the toolbar and the renderers.
 */
export {
  CONTENT_VIEWS_QUERY_KEY,
  useContentViews,
  useCreateContentView,
  useUpdateContentView,
  useDeleteContentView,
  useReorderContentViews,
} from "./hooks/use-content-views"
export { useViewConfigAutosave, VIEW_AUTOSAVE_DELAY_MS } from "./hooks/use-view-config-autosave"
export { useViewLayoutState } from "./hooks/use-view-layout-state"
export { toViewToolbarState, toContentViewConfig, type ViewToolbarState } from "./lib/view-config-mapping"
export { resolveActiveViewId } from "./lib/resolve-active-view"
export { viewProblemType, type CreateContentViewBody, type UpdateContentViewBody } from "./api/content-views.api"
export { ViewEmptyState, type ViewEmptyStateProps } from "./components/view-empty-state"
