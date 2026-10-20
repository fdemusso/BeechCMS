// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Flash as Zap } from 'reicon-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { usePermissions } from '@/features/shared/hooks/use-permissions'

interface AutomationEmptyStateProps {
  onNew: () => void
}

export function AutomationEmptyState({ onNew }: AutomationEmptyStateProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const canUpdateGlobal = can('content:update', '*')
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
        <Zap className="size-6 text-muted-foreground" />
      </div>
      <h3 className="font-heading text-sm font-medium mb-1">{t('automations.panel.emptyTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-48">
        {t('automations.panel.emptyDescription')}
      </p>
      {canUpdateGlobal ? (
        <Button size="sm" onClick={onNew}>
          {t('automations.panel.emptyAction')}
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button size="sm" disabled>
                {t('automations.panel.emptyAction')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Manca il permesso 'content:update' globale
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
