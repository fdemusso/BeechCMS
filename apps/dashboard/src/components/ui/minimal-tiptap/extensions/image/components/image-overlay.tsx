// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { Spinner } from "../../../components/spinner"
import { cn } from "@/lib/utils"

export const ImageOverlay = React.memo(() => {
  return (
    <div
      className={cn(
        "flex flex-row items-center justify-center",
        "absolute inset-0 rounded bg-[var(--mt-overlay)] opacity-100 transition-opacity"
      )}
    >
      <Spinner className="size-7" />
    </div>
  )
})

ImageOverlay.displayName = "ImageOverlay"
