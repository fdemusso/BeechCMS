// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useFieldsConfig } from "../context"
import type { FieldEditProps } from "../types"

/**
 * RichText Field Editor Component.
 *
 * This is a thin wrapper component that delegates the actual rich-text editing UI and logic
 * to the injected `RichtextEditor` slot retrieved from the {@link useFieldsConfig} context.
 * Decoupling this dependency avoids importing heavy editor libraries directly into the
 * fields folder.
 *
 * @param props - Component properties conforming to {@link FieldEditProps}.
 * @param props.branch - The schema branch metadata definition for this field.
 * @param props.value - The current rich-text value (typically an HTML string or JSON state).
 * @param props.onChange - Callback fired when the editor content changes.
 * @returns The rendered RichtextEditor component slot.
 */
export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  const { t: translate } = useTranslation()
  const { components } = useFieldsConfig()
  return (
    <components.RichtextEditor
      value={value}
      onChange={onChange}
      placeholder={translate("content.editor.writeField", { field: branch.label.toLowerCase() })}
    />
  )
}

