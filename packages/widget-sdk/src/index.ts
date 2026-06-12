// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @beechcms/widget-sdk — public contract for custom dashboard widgets.
 *
 * Build-time registration only (decision D9): a custom widget is trusted
 * code compiled into the operator's own dashboard build, not a runtime
 * plugin. See `docs/custom-widgets.md`.
 */

export type {
  AggregateFormula,
  TimeWindow,
  DateRange,
  WidgetWindow,
  DistributionSlice,
  TimeseriesPoint,
  DashboardWidgetInstance,
} from '@beechcms/core'
export { isDateRange } from '@beechcms/core'

export * from './widget-definition.js'
export * from './define-widget.js'
export * from './provider.js'
export * from './hooks/use-widget-data.js'

export { WidgetShell } from './components/widget-shell.js'
export type { WidgetShellProps } from './components/widget-shell.js'
export { WidgetEmpty } from './components/widget-empty.js'
export type { WidgetEmptyProps } from './components/widget-empty.js'
export { WidgetError } from './components/widget-error.js'
export type { WidgetErrorProps } from './components/widget-error.js'
