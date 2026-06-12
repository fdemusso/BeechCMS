// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { WidgetDefinition } from "./widget-definition"

// `any` is required here: the map holds `WidgetDefinition<TConfig>` for many
// unrelated `TConfig`s, and `ComponentType`'s class-component branch isn't
// covariant in props, so `WidgetDefinition<unknown>` can't hold every
// `WidgetDefinition<TConfig>`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const definitions = new Map<string, WidgetDefinition<any>>()

/**
 * Registers a widget type. Throws if `type` is already registered.
 *
 * Types without the `core/` prefix (custom/third-party widgets) are
 * forced into `category: "custom"` regardless of what the author
 * declared, so the picker groups them predictably.
 */
export function registerWidget<TConfig>(definition: WidgetDefinition<TConfig>): void {
  if (definitions.has(definition.type)) {
    throw new Error(`Widget type "${definition.type}" is already registered.`)
  }
  const resolved = definition.type.startsWith("core/")
    ? definition
    : { ...definition, category: "custom" as const }
  definitions.set(definition.type, resolved)
}

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return definitions.get(type)
}

/** Stable order: category, then labelKey — used by the Sprint 05 picker. */
export function listWidgetDefinitions(): WidgetDefinition[] {
  return Array.from(definitions.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.labelKey.localeCompare(b.labelKey)
  })
}

/** Feeds `validateDashboardLayout`'s `knownWidgetTypes` context. */
export function knownWidgetTypes(): ReadonlySet<string> {
  return new Set(definitions.keys())
}
