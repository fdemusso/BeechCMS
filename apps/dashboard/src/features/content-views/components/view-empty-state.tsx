// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Layer } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/small-cta"

export interface ViewEmptyStateProps {
  /** Translated label of the View Type whose last instance was deleted. */
  readonly typeLabel: string
  /** Absent for users without content:update: the state then only explains. */
  readonly onCreate?: () => void
}

export function ViewEmptyState({ typeLabel, onCreate }: ViewEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Layer className="size-5" />
          </EmptyMedia>
          <EmptyTitle>{t("content.views.emptyTitle", { label: typeLabel })}</EmptyTitle>
          <EmptyDescription>{t("content.views.emptyDescription", { label: typeLabel })}</EmptyDescription>
        </EmptyHeader>
        {onCreate && (
          <EmptyContent>
            <Button onClick={onCreate}>{t("content.views.emptyCreate")}</Button>
          </EmptyContent>
        )}
      </Empty>
    </div>
  )
}
