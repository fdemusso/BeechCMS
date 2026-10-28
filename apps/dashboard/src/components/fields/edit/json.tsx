// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { FieldEditProps } from "../types"

const LazyJsonCodeEditor = React.lazy(() => 
  import("./json-code-editor").then(m => ({ default: m.JsonCodeEditor }))
)

export function JsonEdit({ branch, value, onChange, disabled, readOnly: propReadOnly }: FieldEditProps) {
  const isReadOnly = Boolean(propReadOnly || disabled || (branch as unknown as { readOnly?: boolean }).readOnly)

  return (
    <React.Suspense fallback={<div className="h-40 w-full animate-pulse rounded-control bg-muted/50 border border-input" />}>
      <LazyJsonCodeEditor
        id={branch.alias}
        value={value}
        onChange={(text) => {
          // `tags` must reach the API as an array; keep the raw text while the JSON is still invalid.
          if (branch.type !== "tags") return onChange(text)
          try {
            onChange(JSON.parse(text) as unknown)
          } catch {
            onChange(text)
          }
        }}
        readOnly={isReadOnly}
      />
    </React.Suspense>
  )
}
