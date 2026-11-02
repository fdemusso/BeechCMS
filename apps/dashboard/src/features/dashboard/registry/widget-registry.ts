// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  isWidgetRequirementMet,
  resolveCoreWidgetRequirement,
  type EffectivePermissions,
  type WidgetRequirementLookup,
} from "@beechcms/core"
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

/** Widgets temporarily switched off: hidden from the picker and rendered as
 *  a "not working in this version" notice in existing layouts. Remove a type
 *  from this set to re-enable it. */
const DISABLED_WIDGET_TYPES: ReadonlySet<string> = new Set([
  "core/activity-feed",
  "core/ai-insights",
  "core/media-gallery",
  "core/system-health",
  "core/site-status",
  "core/storage",
])

export function isWidgetDisabled(type: string): boolean {
  return DISABLED_WIDGET_TYPES.has(type)
}

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return definitions.get(type)
}

/** Built-in `core/` types resolve through core's table; any other type through its registered `requires`. */
export const widgetRequirementOf: WidgetRequirementLookup = (widget) => {
  if (widget.type.startsWith("core/")) return resolveCoreWidgetRequirement(widget)
  return getWidgetDefinition(widget.type)?.requires
}

/** Whether a freshly placed instance of `definition` (its `defaultConfig`) is usable by `permissions`. */
export function isWidgetDefinitionUsable(definition: WidgetDefinition, permissions: EffectivePermissions): boolean {
  const config =
    typeof definition.defaultConfig === "object" && definition.defaultConfig !== null
      ? (definition.defaultConfig as Record<string, unknown>)
      : {}
  return isWidgetRequirementMet(widgetRequirementOf({ type: definition.type, config }), permissions, config)
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
