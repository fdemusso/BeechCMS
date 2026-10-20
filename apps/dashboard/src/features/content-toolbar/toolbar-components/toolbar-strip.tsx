// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"

/** The sticky strip under the SiteHeader that holds the switcher row and the filter banners. */
export function ToolbarStrip({ children }: { readonly children: ReactNode }) {
  return (
    <div className="sticky top-(--header-height) z-10 bg-background/95 backdrop-blur-sm">
      <Card className="py-3 border-0 ring-0 bg-transparent shadow-none rounded-none">
        <CardContent className="px-4 py-0">{children}</CardContent>
      </Card>
    </div>
  )
}
