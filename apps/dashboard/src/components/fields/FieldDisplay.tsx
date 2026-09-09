// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
import * as React from "react"
import { resolvePolicies } from "@beechcms/core"
import { getDisplayComponent } from "./registry"
import type { FieldDisplayProps } from "./types"

/**
 * Entry point di sola lettura per i campi.
 * Applica la visibility policy prima di delegare al registro dei renderer.
 * FieldEdit non è interessato: l'editor mostra sempre il valore raw.
 */
export const FieldDisplay = React.memo(function FieldDisplay(props: FieldDisplayProps) {
  const { branch } = props
  const { visibility } = resolvePolicies(branch)

  if (visibility === 'hidden') return null

  const Component = getDisplayComponent(branch.type)

  if (visibility === 'masked') {
    return <Component {...props} value="••••••••" />
  }

  return <Component {...props} />
})
