// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { resolvePolicies } from "@beechcms/core"
import { getEditComponent } from "./registry"
import type { FieldEditProps } from "./types"

/**
 * Entry point for editable fields.
 * Renders a compact badge for fields with `hash` privacy policies (restricted),
 * otherwise delegates to the registered edit renderer for the branch type (including confidential fields).
 */
export function FieldEdit(props: FieldEditProps) {
  const { branch } = props
  const { t } = useTranslation()
  const { privacy } = resolvePolicies(branch)

  if (privacy === 'hash') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {t("fields.restricted", "Restricted")}
        </span>
      </div>
    )
  }

  const Component = getEditComponent(branch.type)
  return <Component {...props} />
}
