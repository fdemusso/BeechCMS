// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { Loader } from "@/components/icons"
import { cn } from "@/lib/utils"

type SpinnerProps = React.ComponentProps<typeof Loader>

const SpinnerComponent = function Spinner({
  className,
  ...props
}: SpinnerProps) {
  return <Loader className={cn("animate-spin", className)} {...props} />
}

SpinnerComponent.displayName = "Spinner"

export const Spinner = React.memo(SpinnerComponent)
