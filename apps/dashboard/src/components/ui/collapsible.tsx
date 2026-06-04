// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { CollapsibleTrigger } from "./collapsible-trigger"
import { CollapsibleContent } from "./collapsible-content"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
