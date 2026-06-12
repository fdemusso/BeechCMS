// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { DashboardWidgetInstance } from "@beechcms/core"
import { getWidgetDefinition } from "../registry/widget-registry"
import { WidgetErrorBoundary } from "../components/widget-error-boundary"

export interface DashboardWidgetHostProps {
  instance: DashboardWidgetInstance
}

/** Resolves a widget instance to its definition, validates `config`, and
 *  wraps rendering in an error boundary. Unknown types render a placeholder
 *  instead of crashing or disappearing (config drift must not blank a
 *  dashboard). */
export function DashboardWidgetHost({ instance }: DashboardWidgetHostProps) {
  const { t } = useTranslation()
  const definition = getWidgetDefinition(instance.type)

  if (!definition) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center rounded-xl border-2 border-dashed border-muted p-4">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.widgetRegistry.unknown")}{" "}
          <span className="font-mono font-semibold">{instance.type}</span>
        </p>
      </div>
    )
  }

  const parsed = definition.configSchema.safeParse(instance.config)
  if (!parsed.success) {
    console.warn(
      `[BeechCMS] Widget "${instance.id}" (${instance.type}) has an invalid config; falling back to defaults.`,
      parsed.error,
    )
  }
  const config = parsed.success ? parsed.data : definition.defaultConfig

  const Widget = definition.component

  return (
    <WidgetErrorBoundary widgetId={instance.id}>
      <Widget instance={instance} config={config} />
    </WidgetErrorBoundary>
  )
}
