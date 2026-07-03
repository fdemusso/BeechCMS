// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useFieldsConfig } from "../context"
import type { FieldEditProps } from "../types"

/**
 * Field Renderer: RichText.
 * Thin wrapper that delegates rendering to the injected RichtextEditor slot.
 */
export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  const { t } = useTranslation()
  const { components } = useFieldsConfig()
  return (
    <components.RichtextEditor
      value={value}
      onChange={(val) => onChange(val)}
      placeholder={t("content.editor.writeField", { field: branch.label.toLowerCase() })}
    />
  )
}
