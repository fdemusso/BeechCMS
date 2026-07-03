// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { resolvePolicies } from "@beechcms/core"
import { getEditComponent } from "./registry"
import type { FieldEditProps } from "./types"

export function FieldEdit(props: FieldEditProps) {
  const { branch } = props
  const { privacy } = resolvePolicies(branch)

  if (privacy === 'hash' || privacy === 'encrypt') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span>••••••••</span>
        <span className="text-xs">(campo sensibile — non modificabile)</span>
      </div>
    )
  }

  const Component = getEditComponent(branch.type)
  return <Component {...props} />
}
