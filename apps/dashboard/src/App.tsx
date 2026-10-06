// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { lazy, Suspense, useEffect } from "react"
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { LoginForm } from "@/features/auth"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { ContentListPage } from "@/pages/content-list"
import { ErrorPage } from "@/pages/error-page"
import { ForgotPasswordPage } from "@/pages/forgot-password/ForgotPasswordPage"
import { ResetPasswordPage } from "@/pages/reset-password/ResetPasswordPage"
import { AcceptInvitePage } from "@/pages/accept-invite/AcceptInvitePage"
import { SetupPage } from "@/pages/setup/SetupPage"
import { DashboardPage } from "@/features/dashboard"
import { SettingsPage } from "@/features/settings"
import { CommandPalette } from "@/features/command-palette"
import { FieldsProvider } from "@/components/fields/context"
import { useLocaleConfig, useSchema } from "@/features/shared"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import { EntryEditorDialog } from "@/features/entry-editor"
import { RichtextEditor } from "@/features/richtext-editor"
import { ConsentPage } from "@/features/oauth-consent"
import "./App.css"

// Route-level code splitting: pages off the hot path (content list, dashboard)
// stay out of the initial bundle.
const ContentTrashPage = lazy(() => import("@/pages/content-trash").then((m) => ({ default: m.ContentTrashPage })))
const ImportJobDetailPage = lazy(() => import("@/pages/import-job-detail").then((m) => ({ default: m.ImportJobDetailPage })))
const TestFieldsPage = lazy(() => import("@/pages/test-fields").then((m) => ({ default: m.TestFieldsPage })))
const WidgetLabPage = lazy(() => import("@/pages/widget-lab").then((m) => ({ default: m.WidgetLabPage })))
const AnalyticsPage = lazy(() => import("@/pages/analytics").then((m) => ({ default: m.AnalyticsPage })))
const CreateNewPage = lazy(() => import("@/pages/create-new").then((m) => ({ default: m.CreateNewPage })))
const ScheduledPage = lazy(() => import("@/pages/scheduled").then((m) => ({ default: m.ScheduledPage })))
const DraftsListPage = lazy(() => import("@/pages/drafts-list").then((m) => ({ default: m.DraftsListPage })))

/**
 * Concrete implementation of {@link FieldsContextType} serving as the dependency
 * injection composition root for all custom fields in the dashboard application.
 */
const fieldsConfig = {
  useSchema,
  useLocaleConfig,
  fetchById: (slug: string, id: string) => contentApi.fetchById(slug, id),
  searchRelations: (slug: string, params: { search?: string; limit?: number }) =>
    contentApi.fetchList(slug, { ...params, page: 1 }).then((response) => response.items),
  queryKeys: {
    detail: CONTENT_QUERY_KEYS.detail,
    lists: CONTENT_QUERY_KEYS.lists,
  },
  components: { EntryEditorDialog, RichtextEditor },
}

function SplashScreen() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function LoginPage() {
  // Setup detection now lives in AuthProvider (RootLayout below redirects
  // globally, regardless of route) so it also catches a reset/restore that
  // happens while the user is sitting on a different page than /login.
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12">
      <div className="w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl">
        <LoginForm />
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <SplashScreen />
  if (status === 'unauthenticated') {
    // Deep links (notably /oauth/consent, whose query string IS the OAuth
    // authorization request) must survive the login bounce.
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }
  return <>{children}</>
}

// /setup must be unreachable once an admin already exists — leaving it open
// lets anyone unauthenticated see the wizard (and the env flags GET /auth/setup
// returns) after install. needsSetup === null means "not checked yet" (fresh
// load), so only block once the check has confirmed false.
function SetupRoute({ children }: { children: React.ReactNode }) {
  const { needsSetup } = useAuth()
  if (needsSetup === false) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RootLayout() {
  // react-router's basename joining drops the trailing slash for the root
  // route ("/admin" instead of "/admin/"). Query-string updates (e.g. the
  // dashboard's ?page= tabs) then append directly to "/admin", producing
  // "/admin?page=..." which trips Vite's/Workers Assets' strict base-URL
  // check on reload. Normalize once on mount via the raw browser URL —
  // react-router's own navigate() would re-create the same href.
  useEffect(() => {
    if (window.location.pathname === "/admin") {
      window.history.replaceState(null, "", `/admin/${window.location.search}${window.location.hash}`)
    }
  }, [])

  const { needsSetup } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Global integrity gate: if a DB reset/restore wipes the admin user while
  // this tab is open (db:reset:local, session revoke, etc.), force everyone
  // to /setup regardless of which route or auth state they were sitting on.
  useEffect(() => {
    if (needsSetup && pathname !== '/setup') {
      navigate('/setup', { replace: true })
    }
  }, [needsSetup, pathname, navigate])

  if (needsSetup && pathname !== '/setup') return <SplashScreen />
  return (
    <>
      <CommandPalette />
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/setup",
        element: (
          <SetupRoute>
            <SetupPage />
          </SetupRoute>
        ),
      },
      {
        path: "/forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "/reset-password",
        element: <ResetPasswordPage />,
      },
      {
        path: "/accept-invite",
        element: <AcceptInvitePage />,
      },
      {
        path: "/",
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/analytics",
        element: (
          <ProtectedRoute>
            <AnalyticsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/drafts",
        element: (
          <ProtectedRoute>
            <DraftsListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/create-new",
        element: (
          <ProtectedRoute>
            <CreateNewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/scheduled",
        element: (
          <ProtectedRoute>
            <ScheduledPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/import-jobs/:jobId",
        element: (
          <ProtectedRoute>
            <ImportJobDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/:slug/create",
        element: (
          <ProtectedRoute>
            <ContentListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/:slug/trash",
        element: (
          <ProtectedRoute>
            <ContentTrashPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/:slug/:id",
        element: (
          <ProtectedRoute>
            <ContentListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/:slug",
        element: (
          <ProtectedRoute>
            <ContentListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/settings",
        element: (
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/oauth/consent",
        element: (
          <ProtectedRoute>
            <ConsentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/test-fields",
        element: (
          <ProtectedRoute>
            <TestFieldsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/widget-lab",
        element: (
          <ProtectedRoute>
            <WidgetLabPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
], { basename: '/admin' })

/**
 * The root Application component.
 * Configures the Authentication Context Provider, the Fields Context Provider
 * (passing the injected composition root), and renders the React Router Provider.
 *
 * @returns The bootstrap React element for the application.
 */
function App() {
  return (
    <AuthProvider>
      <FieldsProvider value={fieldsConfig}>
        <RouterProvider router={router} />
      </FieldsProvider>
    </AuthProvider>
  )
}

export default App
