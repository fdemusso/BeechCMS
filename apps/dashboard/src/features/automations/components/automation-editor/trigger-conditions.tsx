import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch, BranchType } from '@beechcms/core'
import { FilterConditionInput } from '@/features/content-toolbar/toolbar-components/filter-condition-input'
import type { FilterGroupType } from '@/features/content-toolbar/shared'
import { TRIGGER_OPS } from '../../schema/automation.schema'
import type { AutomationFormValues } from '../../schema/automation.schema'

function branchTypeToFilterType(type: BranchType): FilterGroupType {
  switch (type) {
    case 'number': return 'number'
    case 'date': return 'date'
    case 'boolean': return 'boolean'
    case 'tags': return 'tags'
    default: return 'text'
  }
}

interface TriggerConditionsProps {
  seedBranches: Branch[]
  disabled?: boolean
}

export function TriggerConditions({ seedBranches, disabled }: TriggerConditionsProps) {
  const { t } = useTranslation()
  const { control, watch, setValue } = useFormContext<AutomationFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'trigger_conditions' })

  return (
    <div className="mt-2">
      {fields.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {fields.map((field, idx) => {
            const fieldAlias = watch(`trigger_conditions.${idx}.field`)
            const op = watch(`trigger_conditions.${idx}.op`)
            const rawValue = watch(`trigger_conditions.${idx}.value`)

            const branch = seedBranches.find((b) => b.alias === fieldAlias)
            const filterType = branch ? branchTypeToFilterType(branch.type) : 'text'

            const showValueInput = op !== 'isempty' && op !== 'isnotempty'

            return (
              <div key={field.id} className="flex gap-1.5 items-center">
                <Select
                  value={fieldAlias ?? ''}
                  onValueChange={(v) => setValue(`trigger_conditions.${idx}.field`, v)}
                  disabled={disabled}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                    <SelectValue placeholder={t('automations.editor.conditionField')} />
                  </SelectTrigger>
                  <SelectContent>
                    {seedBranches.map((b) => (
                      <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={op ?? 'eq'}
                  onValueChange={(v) => setValue(`trigger_conditions.${idx}.op`, v as any)}
                  disabled={disabled}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_OPS.map((o) => (
                      <SelectItem key={o} value={o}>{t(`automations.ops.${o}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {showValueInput && (
                  <FilterConditionInput
                    type={filterType}
                    value={rawValue === '' ? null : (rawValue as string | number | boolean | null)}
                    onChange={(v) => setValue(`trigger_conditions.${idx}.value`, v === null ? '' : String(v))}
                    className="h-7 flex-1"
                    textClassName="text-xs"
                  />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => remove(idx)}
                  disabled={disabled}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => append({ field: '', op: 'eq', value: '' })}
        disabled={disabled}
      >
        <Plus className="size-3 mr-1" />
        {t('automations.editor.addCondition')}
      </Button>
    </div>
  )
}
