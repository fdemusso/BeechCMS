// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export * from "./types/dashboard.types"
export * from "./types/widget.types"
export * from "./hooks/use-dashboard-stats"
export { default as DashboardPage } from "./pages/dashboard-page"

// Widget system — usable by external developers extending the dashboard
export { DashboardWidgetShell } from "./components/dashboard-widget-shell"
export { WidgetErrorBoundary } from "./components/widget-error-boundary"
export { WidgetRegistry } from "./components/widget-registry"
