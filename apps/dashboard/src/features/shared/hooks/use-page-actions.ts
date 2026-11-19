// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Permission, Scope } from "@beechcms/core"
import type { IconComponent } from "@/lib/icon-registry"

/** Permission an action needs to be enabled; same shape and evaluation as the palette's requirements. */
interface PageActionRequirement {
  readonly permission: Permission
  /** GLOBAL_SCOPE ('*') or a seed slug. Omitted: held on at least one scope. */
  readonly scope?: Scope
}

/** Question asked before an irreversible action runs (brief rule 2). Cancelling changes nothing. */
interface PageActionConfirm {
  readonly title: string
  readonly description: string
  /** Destructive styling on the confirming button (design contract, "Deleting"). */
  readonly destructive?: boolean
}

/** One action a page offers, run through the page's own handler (brief rule 1). */
export interface PageAction {
  /** Unique within its declaration, e.g. "publish-draft". */
  readonly id: string
  /** Translated by the host. */
  readonly label: string
  readonly icon: IconComponent
  readonly keywords?: readonly string[]
  readonly requires?: PageActionRequirement
  /** Why the action cannot run right now (e.g. a save in flight); disables it like a failing `requires`. */
  readonly unavailableReason?: string
  readonly confirm?: PageActionConfirm
  readonly perform:
    | { readonly kind: "run"; readonly run: () => void }
    | { readonly kind: "copy"; readonly value: string }
}

/** Everything one mounted page offers right now. */
export interface PageActionDeclaration {
  /** The declaring surface, e.g. "entry-editor". */
  readonly hostId: string
  /** The record the actions act on; null when there is none (create mode). Frozen with an action when it is selected. */
  readonly targetId: string | null
  /** Group heading in the palette, translated by the host (e.g. "Edit Post"). */
  readonly title: string
  readonly actions: readonly PageAction[]
}

interface StoreEntry {
  readonly key: string
  readonly declaration: PageActionDeclaration
}

const NO_DECLARATIONS: readonly PageActionDeclaration[] = []

// Insertion order is first-publish order; a replaced entry keeps its slot.
const entries = new Map<string, StoreEntry>()
const listeners = new Set<() => void>()
let snapshot: readonly PageActionDeclaration[] = NO_DECLARATIONS

function commit(): void {
  const next = [...entries.values()].reverse().map((entry) => entry.declaration)
  snapshot = next.length === 0 ? NO_DECLARATIONS : next
  listeners.forEach((listener) => listener())
}

function publish(key: string, declaration: PageActionDeclaration): void {
  if (entries.get(key)?.declaration === declaration) return
  entries.set(key, { key, declaration })
  commit()
}

function withdraw(key: string): void {
  if (entries.delete(key)) commit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Publishes `declaration` while the caller is mounted; null withdraws it. Pass a memoised value. */
export function useDeclarePageActions(declaration: PageActionDeclaration | null): void {
  const key = React.useId()

  React.useEffect(() => {
    if (declaration) publish(key, declaration)
    else withdraw(key)
  }, [key, declaration])

  React.useEffect(() => () => withdraw(key), [key])
}

/** Every published declaration, most recently published first. Re-renders only when the set changes. */
export function usePageActionDeclarations(): readonly PageActionDeclaration[] {
  return React.useSyncExternalStore(subscribe, getPageActionDeclarations, getPageActionDeclarations)
}

/** The same snapshot outside React (the palette's confirm-time check, tests). */
export function getPageActionDeclarations(): readonly PageActionDeclaration[] {
  return snapshot
}
