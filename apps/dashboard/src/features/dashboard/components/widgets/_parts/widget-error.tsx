// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// The presentational primitive moved to @beechcms/widget-sdk (Sprint 07);
// this wrapper supplies the dashboard's i18n copy.
import { useTranslation } from "react-i18next"
import { WidgetError as SdkWidgetError } from "@beechcms/widget-sdk"

interface WidgetErrorProps {
  message?: string
  onRetry?: () => void
}

export function WidgetError({ message, onRetry }: WidgetErrorProps) {
  const { t } = useTranslation()
  return (
    <SdkWidgetError
      message={message ?? t("dashboard.widgets.error.message")}
      onRetry={onRetry}
      retryLabel={t("dashboard.widgets.error.retry")}
    />
  )
}
