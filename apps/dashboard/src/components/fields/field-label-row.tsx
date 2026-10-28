// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/**
 * The right-hand slot of a field's label row. `undefined`: no label row around the field (the field renders
 * its aside inline); `null`: the row exists but its slot has not mounted yet; an element: ready to receive.
 */
const FieldLabelSlotContext = React.createContext<HTMLElement | null | undefined>(undefined)

interface FieldLabelRowProps {
  /** The label node, already styled by the caller. */
  readonly label: React.ReactNode
  /** The field and whatever hangs under it. */
  readonly children: React.ReactNode
  readonly className?: string
}

/**
 * A field's label with a right-aligned slot on the same line. The slot stays empty (and collapsed) unless
 * the field below fills it with {@link FieldLabelAside}, e.g. the selection count of a multi relation.
 */
export function FieldLabelRow({ label, children, className }: FieldLabelRowProps) {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        {label}
        <div ref={setSlot} className="shrink-0 text-xs text-muted-foreground empty:hidden" />
      </div>
      <FieldLabelSlotContext.Provider value={slot}>{children}</FieldLabelSlotContext.Provider>
    </div>
  )
}

/**
 * Content for the right of the field's label. Inside a {@link FieldLabelRow} it moves to the label's line;
 * outside one it stays above the field, so the field never loses it.
 */
export function FieldLabelAside({ children }: { readonly children: React.ReactNode }) {
  const slot = React.useContext(FieldLabelSlotContext)
  if (slot === undefined) return <p className="text-xs text-muted-foreground">{children}</p>
  // `null` is the one frame before the slot mounts: render nothing rather than flash the inline fallback.
  return slot ? createPortal(children, slot) : null
}
