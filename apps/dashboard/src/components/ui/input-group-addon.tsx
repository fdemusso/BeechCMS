// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"

function InputGroupAddon({
  className,
  align = "inline-end",
  ...props
}: React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "absolute top-0 bottom-0 flex items-center justify-center",
        align === "inline-start" ? "left-0 pl-3" : "right-0 pr-1",
        className
      )}
      {...props}
    />
  )
}

export { InputGroupAddon }
