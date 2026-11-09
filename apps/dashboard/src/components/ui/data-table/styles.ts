// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Grid-line styling shared by header cells, data cells and placeholder cells.
 * One definition so the three can never drift apart: change the line colour or weight here only.
 */

/** Colour of every horizontal row separator (apply on a <tr>). */
export const ROW_SEPARATOR_CLASS = "border-border/60"

/**
 * Keyboard-focused row (apply on a <tr>): same background as a selected row, so the user always
 * knows where they are. Only while the table holds focus. A background rather than an outline/ring
 * on purpose: a ring on the last row gets clipped by the frame's rounded corners.
 */
export const FOCUSED_ROW_CLASS = "group-focus-within/dt:data-[focused]:bg-muted"

/** Vertical column separator (apply on a <th>/<td>); the last column has none, the frame draws that edge. */
export const COLUMN_SEPARATOR_CLASS = "border-r border-border/60 last:border-r-0"

/**
 * The line under the last data row, drawn on the empty space that follows it inside the frame. The last row has no
 * bottom border of its own (the frame draws that edge), so when the frame is taller than the rows (a short table in
 * a tall widget) the rows would end without a line. An inset shadow takes no room: with no space left (the rows fill
 * the frame) the element is 0px tall and draws nothing, so the frame's edge is never doubled.
 */
export const TAIL_SEPARATOR_CLASS =
  // design-ok: 1px inset hairline, the contract has no shadow tokens (#undecided)
  "shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--color-border)_60%,transparent)]"
