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

/**
 * Header cell that stays put while the rows scroll under it (grouped mode). Sticky cells need an opaque background
 * (the normal header tint is translucent, rows would show through) so the tint is painted over `bg-background`.
 * With collapsed borders a sticky cell loses its own border, so the bottom hairline is an inset shadow.
 */
export const STICKY_HEADER_CLASS =
  // design-ok: opaque tint = translucent border token over the page background, no opaque token exists (#undecided)
  "sticky top-0 z-20 bg-background bg-[linear-gradient(color-mix(in_oklab,var(--color-border)_40%,transparent),color-mix(in_oklab,var(--color-border)_40%,transparent))] shadow-[inset_0_-1px_0_0_var(--color-border)]"

/** Group header cell pinned right under the sticky column header (offset = `--dt-header-h`, set by DataTableBody). */
export const STICKY_GROUP_CLASS =
  // design-ok: same opaque-tint trick as STICKY_HEADER_CLASS, for the group row (#undecided)
  "sticky top-[calc(var(--dt-header-h,0px)-1px)] z-10 bg-background bg-[linear-gradient(color-mix(in_oklab,var(--color-muted)_60%,transparent),color-mix(in_oklab,var(--color-muted)_60%,transparent))] shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--color-border)_60%,transparent)]"

/**
 * Grouped table: separate borders so each cell owns its edges (a collapsed border is the table's and does not stick).
 * The row divider moves from the <tr> (ignored when borders are separate) to the cells; the last row of the last
 * group has none, the frame draws that edge.
 */
export const GROUPED_TABLE_CLASS =
  "border-separate border-spacing-0 [&_td]:border-b [&_td]:border-border/60 [&_tbody:last-child_tr:last-child_td]:border-b-0"
