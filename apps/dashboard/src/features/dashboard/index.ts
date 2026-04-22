export * from "./types/dashboard.types"
export * from "./types/widget.types"
export * from "./hooks/use-dashboard-stats"
export { default as DashboardPage } from "./pages/dashboard-page"

// Widget system — usable by external developers extending the dashboard
export { DashboardWidgetShell } from "./components/dashboard-widget-shell"
export { WidgetErrorBoundary } from "./components/widget-error-boundary"
export { WidgetRegistry } from "./components/widget-registry"
