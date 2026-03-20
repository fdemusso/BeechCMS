import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom"

export function ErrorPage() {
  const error = useRouteError()

  const isResponseError = isRouteErrorResponse(error)
  let message = "Errore sconosciuto"
  if (isResponseError) {
    message = error.statusText || error.data?.message || "Qualcosa è andato storto"
  } else if (error instanceof Error) {
    message = error.message
  }

  const status = isResponseError ? error.status : null

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {status && (
          <span className="text-6xl font-bold text-muted-foreground">
            {status}
          </span>
        )}
        <h1 className="text-xl font-semibold">Ops, c'è stato un errore</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          to="/"
          className="rounded-md bg-accent px-4 py-2 text-sm !text-white hover:bg-accent/90"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  )
}
