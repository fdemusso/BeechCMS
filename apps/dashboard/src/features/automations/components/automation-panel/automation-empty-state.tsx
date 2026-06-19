// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AutomationEmptyStateProps {
  onNew: () => void
}

export function AutomationEmptyState({ onNew }: AutomationEmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
        <Zap className="size-6 text-muted-foreground" />
      </div>
      <h3 className="font-heading text-sm font-medium mb-1">{t('automations.panel.emptyTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-48">
        {t('automations.panel.emptyDescription')}
      </p>
      <Button size="sm" onClick={onNew}>
        {t('automations.panel.emptyAction')}
      </Button>
    </div>
  )
}
