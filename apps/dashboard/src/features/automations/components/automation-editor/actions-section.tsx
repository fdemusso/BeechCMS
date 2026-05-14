import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Play } from 'lucide-react'
import type { Branch } from '@beechcms/core'
import { ActionCard } from './action-card'
import { ActionSelector } from './action-selector'
import { VisualConnector } from './visual-connector'
import type { AutomationFormValues, ActionFormItem } from '../../schema/automation.schema'

interface ActionsSectionProps {
  seedBranches: Branch[]
}

export function ActionsSection({ seedBranches }: ActionsSectionProps) {
  const { t } = useTranslation()
  const { control, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'actions' })

  function handleAdd(action: ActionFormItem) {
    append(action as any)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <Play className="size-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium">{t('automations.editor.actionsLabel')}</span>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3">{t('automations.editor.noActions')}</p>
      )}

      {fields.map((field, idx) => (
        <div key={field.id}>
          <ActionCard
            index={idx}
            total={fields.length}
            seedBranches={seedBranches}
            onRemove={() => remove(idx)}
            onMoveUp={() => swap(idx, idx - 1)}
            onMoveDown={() => swap(idx, idx + 1)}
          />
          {idx < fields.length - 1 && <VisualConnector />}
        </div>
      ))}

      {(errors.actions as any)?.root?.message && (
        <p className="mt-1 text-xs text-destructive">{(errors.actions as any).root.message}</p>
      )}
      {typeof errors.actions?.message === 'string' && (
        <p className="mt-1 text-xs text-destructive">{errors.actions.message}</p>
      )}

      <div className="mt-3">
        <ActionSelector onAdd={handleAdd} />
      </div>
    </div>
  )
}
