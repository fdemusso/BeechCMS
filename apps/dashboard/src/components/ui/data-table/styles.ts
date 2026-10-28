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
