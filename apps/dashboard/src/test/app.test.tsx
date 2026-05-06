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

vi.mock("@/components/login-form", () => ({ LoginForm: () => <div>LOGIN_FORM</div> }))
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => <div>APP_SIDEBAR</div> }))
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <div>SITE_HEADER</div> }))
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/pages/content-list", () => ({ ContentListPage: () => <div>CONTENT_LIST</div> }))
vi.mock("@/pages/entry-editor", () => ({ EntryEditorPage: () => <div>ENTRY_EDITOR</div> }))
vi.mock("@/pages/test-fields", () => ({ TestFieldsPage: () => <div>TEST_FIELDS</div> }))
vi.mock("@/pages/error-page", () => ({ ErrorPage: () => <div>ERROR_PAGE</div> }))
vi.mock("@/features/dashboard", () => ({ DashboardPage: () => <div>DASHBOARD_PAGE</div> }))
vi.mock("@/features/settings", () => ({ SettingsPage: () => <div>SETTINGS_PAGE</div> }))
vi.mock("@/features/command-palette", () => ({ CommandPalette: () => null }))
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

