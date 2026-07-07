// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Public barrel for the field rendering system: display/edit entry points, shared types, and the field registry. */

export { FieldDisplay } from "./FieldDisplay"
export { FieldEdit } from "./FieldEdit"
export type { FieldDisplayProps, FieldEditProps } from "./types"
export {
  getDisplayComponent,
  getEditComponent,
} from "./registry"
export { BranchItemRow, AUTOMATION_RESERVED } from "./edit/repeater/repeater-branch-item"
export type { BranchItemRowProps } from "./edit/repeater/repeater-branch-item"
