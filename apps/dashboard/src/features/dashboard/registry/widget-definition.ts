// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from "react"
import type { z } from "zod"
import type { DashboardWidgetInstance } from "@beechcms/core"

/** Props every registered widget component receives. */
export interface DashboardWidgetProps<TConfig = unknown> {
  instance: DashboardWidgetInstance
  /** Parsed (and defaulted) via the definition's `configSchema`. */
  config: TConfig
}

/** Describes a widget type that can be placed on the dashboard. */
export interface WidgetDefinition<TConfig = unknown> {
  /** Namespaced type: `core/<name>` for built-ins, npm name for custom. */
  type: string
  /** i18n key for the picker (built-ins); plain string allowed (custom). */
  labelKey: string
  descriptionKey?: string
  /** Lucide icon name for the picker. */
  icon?: string
  category: "stats" | "charts" | "content" | "system" | "custom"
  /** Schema with `.catch()`/`.optional()` so partial configs always parse. */
  configSchema: z.ZodType<TConfig>
  defaultConfig: TConfig
  component: ComponentType<DashboardWidgetProps<TConfig>>
  /** Builder hint (Sprint 05): minimum sensible column span out of 12. */
  minColumnSpan?: number
  /** Builder hint (Sprint 05): config panel. Absent = "no options" notice. */
  ConfigPanel?: ComponentType<{ config: TConfig; onChange: (next: TConfig) => void }>
}
