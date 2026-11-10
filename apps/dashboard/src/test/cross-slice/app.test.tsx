// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const mockRouterState = vi.hoisted(() => ({ capturedRoutes: [] as any[] }))

vi.mock("react-router-dom", () => ({
  createBrowserRouter: (routes: any[]) => {
    mockRouterState.capturedRoutes = routes
    return { __router: true }
  },
  RouterProvider: ({ router }: { router: unknown }) => (
    <div data-testid="router-provider">{JSON.stringify(router)}</div>
  ),
  Navigate: ({ to }: { to: string }) => <div>NAVIGATE:{to}</div>,
  Outlet: () => <div>OUTLET</div>,
}))

vi.mock("@/features/auth/components/login-form", () => ({ LoginForm: () => <div>LOGIN_FORM</div> }))
vi.mock("@/features/navigation", () => ({
  AppShell: ({ children }: { children?: React.ReactNode }) => <div><div>APP_SIDEBAR</div>{children}</div>,
  PageBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, description, actions }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) => (
    <div><h1>{title}</h1>{description}{actions}</div>
  ),
  AppSidebar: () => <div>APP_SIDEBAR</div>,
}))
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/pages/content-list", () => ({ ContentListPage: () => <div>CONTENT_LIST</div> }))
vi.mock("@/pages/test-fields", () => ({ TestFieldsPage: () => <div>TEST_FIELDS</div> }))
vi.mock("@/pages/error-page", () => ({ ErrorPage: () => <div>ERROR_PAGE</div> }))
vi.mock("@/features/dashboard", () => ({ DashboardPage: () => <div>DASHBOARD_PAGE</div> }))
vi.mock("@/features/settings", () => ({
  SettingsDialogHost: () => null,
  SettingsRedirect: () => <div>SETTINGS_PAGE</div>,
  useSettingsDialog: () => ({ open: false, tab: "profile", openSettings: vi.fn(), setTab: vi.fn(), closeSettings: vi.fn() }),
}))
vi.mock("@/pages/app-command-palette", () => ({ AppCommandPalette: () => null }))
vi.mock("@/pages/widget-lab", () => ({ WidgetLabPage: () => <div>WIDGET_LAB</div> }))
vi.mock("@/pages/forgot-password/ForgotPasswordPage", () => ({ ForgotPasswordPage: () => <div>FORGOT_PASSWORD</div> }))
vi.mock("@/pages/reset-password/ResetPasswordPage", () => ({ ResetPasswordPage: () => <div>RESET_PASSWORD</div> }))
vi.mock("@/pages/setup/SetupPage", () => ({ SetupPage: () => <div>SETUP</div> }))

import App from "@/App"

describe("App router", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("crea router con rotte attese e renderizza RouterProvider", () => {
    render(<App />)
    expect(screen.getByTestId("router-provider")).toBeInTheDocument()

    expect(Array.isArray(mockRouterState.capturedRoutes)).toBe(true)
    expect(mockRouterState.capturedRoutes.length).toBe(1)
    const children = mockRouterState.capturedRoutes[0].children as Array<{ path: string }>
    const paths = children.map((r) => r.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        "/login",
        "/",
        "/content/:slug/create",
        "/content/:slug/:id",
        "/content/:slug",
        "/test-fields",
      ])
    )
  })
})

