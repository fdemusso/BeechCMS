/**
 * Sprint 6 — Context panel for the automation editor.
 *
 * Allows authors to declare named pre-loaded queries (AutomationContextLoad)
 * that are resolved before action execution.
 *
 * TODO Sprint 8 (Task 15): after WhenNode recursive groups are implemented,
 * this panel will also expose a "variable ref" picker for the where operands.
 */
import { useTranslation } from 'react-i18next'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AutomationFormValues } from '../../schema/automation.schema'
import { DEFAULT_CONTEXT_LOAD } from '../../schema/automation.schema'
import { ContextLoadCard } from './context-load-card'

export function ContextSection() {
  const { t } = useTranslation()
  const { control } = useFormContext<AutomationFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'context' })

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('automations.context.title')}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => append({ ...DEFAULT_CONTEXT_LOAD })}
        >
          <Plus className="h-3 w-3" />
          {t('automations.context.add')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('automations.context.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <ContextLoadCard key={field.id} index={index} onRemove={() => remove(index)} />
          ))}
        </div>
      )}
    </div>
  )
}
