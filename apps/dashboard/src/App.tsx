// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect } from "react"
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { LoginForm } from "@/features/auth"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { ContentListPage } from "@/pages/content-list"
import { TestFieldsPage } from "@/pages/test-fields"
import { WidgetLabPage } from "@/pages/widget-lab"
import { ErrorPage } from "@/pages/error-page"
import { ForgotPasswordPage } from "@/pages/forgot-password/ForgotPasswordPage"
import { ResetPasswordPage } from "@/pages/reset-password/ResetPasswordPage"
import { SetupPage } from "@/pages/setup/SetupPage"
import { DashboardPage } from "@/features/dashboard"
import { DraftsListPage } from "@/pages/drafts-list"
import { SettingsPage } from "@/features/settings"
import { CommandPalette } from "@/features/command-palette"
import { AnalyticsPage } from "@/pages/analytics"
import { CreateNewPage } from "@/pages/create-new"
import { ScheduledPage } from "@/pages/scheduled"
import "./App.css"

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
  if (status === 'loading') return <SplashScreen />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
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
      <Outlet />
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
        path: "/content/:slug/create",
        element: (
          <ProtectedRoute>
            <ContentListPage />
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

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
