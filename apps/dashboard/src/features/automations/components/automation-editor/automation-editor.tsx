// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { FormProvider } from 'react-hook-form'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Automation, Branch } from '@beechcms/core'
import { TriggerSection } from './trigger-section'
import { ActionsSection } from './actions-section'
import { VisualConnector } from './visual-connector'
import { useAutomationEditor } from './use-automation-editor'

interface AutomationEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seedSlug: string
  seedDisplayName: string
  seedBranches: Branch[]
  automation?: Automation
}

export function AutomationEditor({
  open,
  onOpenChange,
  seedSlug,
  seedDisplayName,
  seedBranches,
  automation,
}: AutomationEditorProps) {
  const { t } = useTranslation()
  const { form, isEdit, isPending, resetForm, onSubmit } = useAutomationEditor({
    seedSlug,
    seedDisplayName,
    automation,
    open,
    onSuccess: () => onOpenChange(false),
  })

  const { register, formState: { errors, isValid } } = form

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <FormProvider {...form}>
          <form onSubmit={onSubmit}>
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle asChild>
                <Input
                  {...register('name')}
                  className="text-lg font-semibold border-0 bg-secondary dark:bg-secondary px-3 py-1.5 h-auto transition-colors focus-visible:ring-1 focus-visible:ring-ring shadow-none"
                  placeholder={t('automations.editor.namePlaceholder')}
                />
              </DialogTitle>
              {errors.name && (
                <p className="text-xs text-destructive mt-1">{t(errors.name.message ?? '')}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {t('automations.editor.subtitle', { seed: seedDisplayName })}
              </p>
            </DialogHeader>

            {/* Body — scrollable */}
            <ScrollArea className="max-h-[60vh]">
              <div className="px-6 py-4 flex flex-col gap-0">
                <TriggerSection seedBranches={seedBranches} />
                <VisualConnector />
                <ActionsSection seedBranches={seedBranches} seedSlug={seedSlug} />
              </div>
            </ScrollArea>

            {/* Footer */}
            <DialogFooter className="mx-0 mb-0 px-6 py-4 border-t">
              <Button
                type="button"
                variant={isEdit ? 'outline' : 'destructive'}
                onClick={() => {
                  if (!isEdit) resetForm()
                  onOpenChange(false)
                }}
              >
                {isEdit ? t('common.back') : t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isPending}
              >
                {isPending
                  ? t('common.saving')
                  : isEdit
                    ? t('common.save')
                    : t('automations.editor.enableButton')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

