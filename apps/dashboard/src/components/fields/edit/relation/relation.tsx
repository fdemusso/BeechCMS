// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Edit component for type `relation`.
 *
 * - Single-value (default): delegates to {@link SingleRelationEdit}
 * - Multi-value (multiple: true): delegates to {@link MultiRelationEdit}
 */
import type { FieldEditProps } from "../../types"
import { SingleRelationEdit } from "./relation-single"
import { MultiRelationEdit } from "./relation-multi"

/** Minimal shape of a relation-type schema branch consumed by this component. */
type BranchLike = {
  /** Slug of the target seed this relation points to. */
  targetSeed?: string
  /** Whether the field accepts multiple related entries. */
  multiple?: boolean
  /** Whether the field is required when creating an entry. */
  requiredOnCreate?: boolean
  /** Whether the field is required when updating an entry. */
  requiredOnUpdate?: boolean
}

/**
 * Dispatches to {@link SingleRelationEdit} or {@link MultiRelationEdit} based on
 * `branch.multiple`, normalizing `value`/`onChange` to the shape each expects.
 *
 * @param branch - Relation schema branch (target seed, cardinality, required flags).
 * @param value - Current field value: string id (single) or string[] (multi).
 * @param onChange - Callback invoked with the updated value.
 * @param disabled - Disables all interaction when true.
 * @param isCreate - Whether the parent form is in create mode (affects required check).
 * @param onInlineCreate - Optional callback to trigger inline creation of a related entry (single mode only).
 */
export function RelationEdit({
  branch,
  value,
  onChange,
  disabled,
  isCreate,
  onInlineCreate,
}: FieldEditProps & {
  disabled?: boolean
  isCreate?: boolean
  onInlineCreate?: () => void
}) {
  const isMultiple = (branch as BranchLike).multiple === true

  if (isMultiple) {
    const selectedIds = Array.isArray(value) ? (value as string[]) : []
    return (
      <MultiRelationEdit
        branch={branch as BranchLike}
        value={selectedIds}
        onChange={(nextSelectedIds) => onChange(nextSelectedIds)}
        disabled={disabled}
        isCreate={isCreate}
      />
    )
  }

  return (
    <SingleRelationEdit
      branch={branch as BranchLike}
      value={typeof value === "string" ? value : null}
      onChange={onChange as (selectedValue: string | null) => void}
      disabled={disabled}
      isCreate={isCreate}
      onInlineCreate={onInlineCreate}
    />
  )
}
