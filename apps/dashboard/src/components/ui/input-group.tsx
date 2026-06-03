// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"
import { InputGroupInput } from "./input-group-input"
import { InputGroupAddon } from "./input-group-addon"
import { InputGroupButton } from "./input-group-button"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn("relative flex w-full items-center", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton }
