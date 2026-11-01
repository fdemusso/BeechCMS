// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { LOCKED_WIDGET_TYPE } from '@beechcms/core'
import type { DashboardSection, DashboardWidgetInstance } from '@beechcms/core'

/** Whether `widget` is the server's opaque stand-in for a widget the author cannot use (`LOCKED_WIDGET_TYPE`). */
export function isLockedWidget(widget: Pick<DashboardWidgetInstance, 'type'>): boolean {
  return widget.type === LOCKED_WIDGET_TYPE
}

/**
 * The fewest columns `section` may keep so that every locked widget stays in its own column:
 * the index of the last column holding one, plus one. 0 = the section holds no locked widget.
 */
export function lockedColumnFloor(section: DashboardSection): number {
  return section.columns.reduce(
    (floor, column, index) => (column.widgets.some(isLockedWidget) ? index + 1 : floor),
    0,
  )
}
