// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { RichtextEditor } from "@/features/richtext-editor"
import type { FieldEditProps } from "../types"

/**
 * Field Renderer: RichText.
 * Thin wrapper that delegates logic to the @/features/richtext-editor slice.
 */
export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  return (
    <RichtextEditor
      value={value}
      onChange={(val) => onChange(val)}
      placeholder={`Scrivi ${branch.label.toLowerCase()}...`}
    />
  )
}
