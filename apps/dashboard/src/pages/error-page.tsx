// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

export function ErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()

  const isResponseError = isRouteErrorResponse(error)
  let message = t("errorPage.unknown")
  if (isResponseError) {
    message = error.statusText || error.data?.message || t("errorPage.unknown")
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
        <h1 className="text-xl font-semibold">{t("errorPage.title")}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          to="/"
          className="rounded-md bg-accent px-4 py-2 text-sm !text-white hover:bg-accent/90"
        >
          {t("errorPage.backHome")}
        </Link>
      </div>
    </div>
  )
}
