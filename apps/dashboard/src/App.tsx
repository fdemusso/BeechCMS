import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { LoginForm } from "@/components/login-form"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { AUTH_TOKEN_KEY } from "@/lib/api"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
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

function DashboardPage() {
  const hasToken =
    typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)
  if (!hasToken) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col gap-4 p-4">
              {/* Wrapper anti-Tennis Neck: blocca il contenuto a max-w-screen-2xl su ultrawide */}
              <div className="mx-auto w-full max-w-screen-2xl">
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <p className="text-muted-foreground text-sm">
                  Benvenuto in Beech CMS
                </p>
                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                  <div className="bg-muted/50 aspect-video rounded-xl" />
                  <div className="bg-muted/50 aspect-video rounded-xl" />
                  <div className="bg-muted/50 aspect-video rounded-xl" />
                </div>
                <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
