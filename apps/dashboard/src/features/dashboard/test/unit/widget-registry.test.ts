// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { z } from "zod"
import "@/features/dashboard/registry/builtin-widgets"
import { hydrateEffectivePermissions } from "@/features/shared/hooks/use-permissions"
import {
  registerWidget,
  getWidgetDefinition,
  listWidgetDefinitions,
  knownWidgetTypes,
  widgetRequirementOf,
  isWidgetDefinitionUsable,
} from "@/features/dashboard/registry/widget-registry"

const guardedSchema = z.object({})
type GuardedConfig = z.infer<typeof guardedSchema>

registerWidget<GuardedConfig>({
  type: "@test/guarded",
  labelKey: "test.guarded.label",
  category: "custom",
  configSchema: guardedSchema,
  defaultConfig: {},
  component: () => null,
  requires: { kind: "global-permission", permission: "manage_users" },
})

/** Expected `listWidgetDefinitions()` order for the 21 built-ins:
 *  category asc (charts < content < stats < system), then labelKey asc. */
const CORE_WIDGET_TYPES_IN_ORDER = [
  "core/area-chart",
  "core/bar-chart",
  "core/content-pulse",
  "core/line-chart",
  "core/pie-chart",
  "core/activity-feed",
  "core/ai-insights",
  "core/data-table",
  "core/media-gallery",
  "core/pending-drafts",
  "core/quick-actions",
  "core/quick-draft",
  "core/recent-activity",
  "core/recent-content",
  "core/publication-stats",
  "core/stat",
  "core/setup-checklist",
  "core/site-status",
  "core/storage",
  "core/system-health",
  "core/text",
]

describe("widget registry", () => {
  it("registers all built-in core/* widget types", () => {
    const known = knownWidgetTypes()
    for (const type of CORE_WIDGET_TYPES_IN_ORDER) {
      expect(known.has(type)).toBe(true)
    }
  })

  it("resolves a known type and returns undefined for an unknown type", () => {
    const stat = getWidgetDefinition("core/stat")
    expect(stat?.type).toBe("core/stat")
    expect(stat?.category).toBe("stats")

    expect(getWidgetDefinition("@acme/ghost")).toBeUndefined()
  })

  it("throws when registering a duplicate type", () => {
    const schema = z.object({})
    type Config = z.infer<typeof schema>
    const definition = {
      type: "test/duplicate-check",
      labelKey: "test.duplicateCheck.label",
      category: "custom" as const,
      configSchema: schema,
      defaultConfig: {} as Config,
      component: () => null,
    }

    registerWidget<Config>(definition)
    expect(() => registerWidget<Config>(definition)).toThrow(/already registered/)
  })

  it("orders definitions by category, then labelKey", () => {
    const all = listWidgetDefinitions()

    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1]
      const curr = all[i]
      const sameCategory = prev.category === curr.category
      expect(prev.category < curr.category || (sameCategory && prev.labelKey <= curr.labelKey)).toBe(true)
    }

    const coreOrder = all.filter((d) => d.type.startsWith("core/")).map((d) => d.type)
    expect(coreOrder).toEqual(CORE_WIDGET_TYPES_IN_ORDER)
  })

  describe("widgetRequirementOf", () => {
    it("returns core's requirement for a built-in type", () => {
      const requirement = widgetRequirementOf({ type: "core/setup-checklist", config: {} })

      expect(requirement).toEqual({ kind: "global-permission", permission: "manage_users" })
    })

    it("returns the requires of a registered custom definition", () => {
      const requirement = widgetRequirementOf({ type: "@test/guarded", config: {} })

      expect(requirement).toEqual({ kind: "global-permission", permission: "manage_users" })
    })

    it("returns undefined for an unregistered custom type", () => {
      const requirement = widgetRequirementOf({ type: "@acme/ghost", config: {} })

      expect(requirement).toBeUndefined()
    })
  })

  describe("isWidgetDefinitionUsable", () => {
    const definitionOf = (type: string) => {
      const definition = getWidgetDefinition(type)
      if (!definition) throw new Error(`${type} is not registered`)
      return definition
    }

    it("is false for core/setup-checklist without manage_users globally and true for core/text with no authority", () => {
      const reader = hydrateEffectivePermissions({ global: [], byScope: { posts: ["manage_users"] } })
      const nobody = hydrateEffectivePermissions(undefined)

      const checklist = isWidgetDefinitionUsable(definitionOf("core/setup-checklist"), reader)
      const text = isWidgetDefinitionUsable(definitionOf("core/text"), nobody)

      expect(checklist).toBe(false)
      expect(text).toBe(true)
    })

    it("offers core/line-chart, whose default seedSlug is empty, to a caller reading one seed", () => {
      const reader = hydrateEffectivePermissions({ global: [], byScope: { posts: ["content:read"] } })

      const usable = isWidgetDefinitionUsable(definitionOf("core/line-chart"), reader)

      expect(usable).toBe(true)
    })

    it("honours the requires of a custom definition", () => {
      const manager = hydrateEffectivePermissions({ global: ["manage_users"], byScope: {} })
      const reader = hydrateEffectivePermissions({ global: ["content:read"], byScope: {} })

      const forManager = isWidgetDefinitionUsable(definitionOf("@test/guarded"), manager)
      const forReader = isWidgetDefinitionUsable(definitionOf("@test/guarded"), reader)

      expect({ forManager, forReader }).toEqual({ forManager: true, forReader: false })
    })
  })
})
