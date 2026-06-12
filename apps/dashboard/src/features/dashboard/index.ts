// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Registers all `core/*` widget definitions — must run before any widget
// is resolved via the registry.
import "./registry/builtin-widgets"

export * from "./types/dashboard.types"
export * from "./hooks/use-dashboard-stats"
export * from "./hooks/use-dashboard-layout"
export { default as DashboardPage } from "./pages/dashboard-page"

// Widget system — usable by external developers extending the dashboard
export { DashboardWidgetShell } from "./components/dashboard-widget-shell"
export { WidgetErrorBoundary } from "./components/widget-error-boundary"
export * from "./registry/widget-definition"
export * from "./registry/widget-registry"
export * from "./renderer/dashboard-layout-renderer"

// Dashboard Builder (Sprint 05) — admin-only customization UI
export * from "./builder"
