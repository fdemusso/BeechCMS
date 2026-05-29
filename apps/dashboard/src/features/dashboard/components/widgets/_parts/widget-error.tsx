// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface WidgetErrorProps {
  message?: string
  onRetry?: () => void
}

export function WidgetError({ message, onRetry }: WidgetErrorProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="size-8 text-destructive/60" />
      <p className="text-sm text-muted-foreground">{message ?? t("dashboard.widgets.error.message")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("dashboard.widgets.error.retry")}
        </Button>
      )}
    </div>
  )
}
