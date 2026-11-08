// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Navigate, useSearchParams } from "react-router-dom"
import { SETTINGS_PARAM } from "../hooks/use-settings-dialog"

/** Legacy `/settings?tab=x` route: lands on the dashboard with the settings dialog open on that tab. */
export function SettingsRedirect() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get("tab") ?? "profile"
  // The content type builder left the dialog: it is a page of its own now.
  if (tab === "content-types") return <Navigate to="/schema" replace />
  return <Navigate to={`/?${SETTINGS_PARAM}=${encodeURIComponent(tab)}`} replace />
}
