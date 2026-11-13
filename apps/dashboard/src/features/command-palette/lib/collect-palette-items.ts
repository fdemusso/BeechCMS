// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  PaletteItem,
  PaletteProvider,
  PaletteQueryContext,
  PaletteRequirement,
  ResolvedPaletteItem,
} from "../types"

/** Whether a provider of either lane contributes to `context`: it serves the page and, when a prefix is typed, declares it. */
export function servesContext(
  provider: Pick<PaletteProvider, "pages" | "prefix">,
  context: Pick<PaletteQueryContext, "page" | "prefix">,
): boolean {
  if (!provider.pages.includes(context.page)) return false
  return !context.prefix || provider.prefix === context.prefix
}

/**
 * Gathers the rows of every provider serving `context.page` and resolves each `requires` against the caller's permissions.
 * A failing requirement disables the row with `describeMissing` text; a provider that throws contributes nothing.
 * The first row with a given id wins.
 * With `context.prefix` set only providers declaring that prefix contribute; without it every provider does.
 */
export function collectPaletteItems(
  providers: readonly PaletteProvider[],
  context: PaletteQueryContext,
  describeMissing: (requirement: PaletteRequirement) => string,
): ResolvedPaletteItem[] {
  const seenIds = new Set<string>()
  const resolved: ResolvedPaletteItem[] = []

  for (const provider of providers) {
    if (!servesContext(provider, context)) continue

    let items: readonly PaletteItem[]
    try {
      items = provider.getItems(context)
    } catch (error) {
      console.error(`[command-palette] provider "${provider.id}" failed`, error)
      continue
    }

    for (const item of items) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      const satisfied = !item.requires || isSatisfied(item.requires, context)
      resolved.push({
        ...item,
        disabledReason: satisfied ? null : describeMissing(item.requires as PaletteRequirement),
      })
    }
  }

  return resolved
}

function isSatisfied({ permission, scope }: PaletteRequirement, { permissions }: PaletteQueryContext): boolean {
  return scope === undefined ? permissions.canAnywhere(permission) : permissions.can(permission, scope)
}
