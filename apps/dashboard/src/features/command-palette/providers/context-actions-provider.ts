// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Module path, not the barrel: suites mock the barrel with a fixed object.
import type { PageAction, PageActionDeclaration } from "@/features/shared/hooks/use-page-actions"
import type { PaletteItem, PaletteProvider, PendingPageAction } from "../types"

/** Actions declared by the pages on screen, grouped per declaration, before every other local row. */
export function createContextActionsProvider(deps: {
  declarations: readonly PageActionDeclaration[]
  requestConfirm: (pending: PendingPageAction) => void
}): PaletteProvider {
  const { declarations, requestConfirm } = deps

  const toItem = (declaration: PageActionDeclaration, action: PageAction): PaletteItem => ({
    id: `context:${declaration.hostId}:${declaration.targetId ?? "new"}:${action.id}`,
    section: declaration.title,
    label: action.label,
    icon: action.icon,
    keywords: action.keywords,
    requires: action.requires,
    unavailableReason: action.unavailableReason,
    perform: action.confirm
      ? {
          kind: "run",
          run: () => requestConfirm({ hostId: declaration.hostId, targetId: declaration.targetId, action }),
        }
      : action.perform,
  })

  return {
    id: "context",
    pages: ["root"],
    getItems: () =>
      declarations.flatMap((declaration) => declaration.actions.map((action) => toItem(declaration, action))),
  }
}
