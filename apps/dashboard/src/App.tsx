import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom"
import { LoginForm } from "@/components/login-form"
import { AUTH_TOKEN_KEY } from "@/lib/api"
import { ContentListPage } from "@/pages/content-list"
import { EntryEditorPage } from "@/pages/entry-editor"
import { TestFieldsPage } from "@/pages/test-fields"
import { ErrorPage } from "@/pages/error-page"
import { DashboardPage } from "@/features/dashboard"
import "./App.css"

function LoginPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12">
      <div className="w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl">
        <LoginForm />
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasToken =
    typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)
  if (!hasToken) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
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
        path: "/test-fields",
        element: (
          <ProtectedRoute>
            <TestFieldsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
