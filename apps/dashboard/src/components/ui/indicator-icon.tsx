// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"

export interface IndicatorIconProps {
  className?: string
  /** Tailwind bg-* class for the dot (see STATUS_TONE_DOT_CLASS). */
  colorClassName: string
  "aria-label"?: string
}

export function IndicatorIcon({ className, colorClassName, ...rest }: IndicatorIconProps) {
  return (
    <span
      role="img"
      className={cn("inline-block size-2 shrink-0 rounded-full", colorClassName, className)}
      {...rest}
    />
  )
}
