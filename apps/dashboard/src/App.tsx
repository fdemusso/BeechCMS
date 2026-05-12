import { useEffect } from "react"
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from "react-router-dom"
import axios from "axios"
import { LoginForm } from "@/features/auth/components/login-form"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { ContentListPage } from "@/pages/content-list"
import { EntryEditorPage } from "@/pages/entry-editor"
import { TestFieldsPage } from "@/pages/test-fields"
import { WidgetLabPage } from "@/pages/widget-lab"
import { ErrorPage } from "@/pages/error-page"
import { ForgotPasswordPage } from "@/pages/forgot-password/ForgotPasswordPage"
import { ResetPasswordPage } from "@/pages/reset-password/ResetPasswordPage"
import { SetupPage } from "@/pages/setup/SetupPage"
import { DashboardPage } from "@/features/dashboard"
import { SettingsPage } from "@/features/settings"
import { CommandPalette } from "@/features/command-palette"
import "./App.css"

function SplashScreen() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()

  useEffect(() => {
    axios.get<{ needsSetup: boolean }>('/auth/setup')
      .then(({ data }) => { if (data.needsSetup) navigate('/setup', { replace: true }) })
      .catch(() => { /* ignore — assume setup already done */ })
  }, [navigate])

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

function RootLayout() {
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
        element: <SetupPage />,
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
        path: "/content/:slug/create",
        element: (
          <ProtectedRoute>
            <EntryEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/content/:slug/:id",
        element: (
          <ProtectedRoute>
            <EntryEditorPage />
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
