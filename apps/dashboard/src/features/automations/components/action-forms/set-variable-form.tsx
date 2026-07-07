// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState, useRef, useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSchema } from '@/features/shared'
import { TRIGGER_OPS } from '../../schema/automation.schema'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface SetVariableFormProps {
  index: number
  triggerSeedSlug?: string
}

export function SetVariableForm({ index, triggerSeedSlug }: SetVariableFormProps) {
  const { t } = useTranslation()
  const { register, control, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { data: seeds = [] } = useSchema()
  const { fields, append, remove } = useFieldArray({ control, name: `actions.${index}.filters` as any })

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceInput, setSourceInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const sourcePopoverId = useId()

  const seedSlug = watch(`actions.${index}.seed_slug` as any) as string
  const fixedId = watch(`actions.${index}.fixed_id` as any) as string
  const column = watch(`actions.${index}.column` as any) as string
  const actionErrors = (errors.actions as any)?.[index]

  const isCollectionMode = !fixedId
  const targetSeed = seeds.find((s) => s.slug === (seedSlug || triggerSeedSlug))

  // Sync sourceInput with stored value on mount / when form value changes externally
  useEffect(() => {
    if (fixedId) {
      setSourceInput(fixedId)
    } else if (seedSlug) {
      setSourceInput(seedSlug)
    }
  }, [fixedId, seedSlug])

  function handleSourceSelect(slug: string) {
    setValue(`actions.${index}.seed_slug` as any, slug)
    setValue(`actions.${index}.fixed_id` as any, '')
    setSourceInput(slug)
    setSourceOpen(false)
  }

  function handleSourceFreeText(value: string) {
    const matchedSeed = seeds.find((s) => s.slug === value)
    if (matchedSeed) {
      handleSourceSelect(matchedSeed.slug)
    } else {
      setValue(`actions.${index}.fixed_id` as any, value)
      setValue(`actions.${index}.seed_slug` as any, '')
      setSourceInput(value)
    }
  }

  function handleSourceInputChange(value: string) {
    setSourceInput(value)
    // If empty, clear both
    if (!value) {
      setValue(`actions.${index}.seed_slug` as any, '')
      setValue(`actions.${index}.fixed_id` as any, '')
    }
  }

  const triggerSeed = seeds.find((s) => s.slug === triggerSeedSlug)

  return (
    <div className="flex flex-col gap-3">
      {/* Variable name */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.variableName')} *
        </label>
        <Input
          {...register(`actions.${index}.name` as any)}
          placeholder="cliente"
          className="h-8 text-sm font-mono"
        />
        {actionErrors?.name && (
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.name.message)}</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.variableNameHint')}</p>
      </div>

      {/* Source combobox */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.source')} *
        </label>
        <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={sourceOpen}
              aria-controls={sourcePopoverId}
              className="h-8 w-full justify-between text-sm font-normal"
            >
              <span className="truncate">
                {fixedId
                  ? <span className="text-muted-foreground">{t('automations.actions.fixedIdBadge', { id: fixedId })}</span>
                  : seedSlug
                    ? (seeds.find((s) => s.slug === seedSlug)?.label ?? seedSlug)
                    : <span className="text-muted-foreground">{t('automations.actions.sourcePlaceholder')}</span>
                }
              </span>
              <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent id={sourcePopoverId} className="w-64 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                ref={inputRef}
                placeholder={t('automations.editor.searchPlaceholder')}
                value={sourceInput}
                onValueChange={handleSourceInputChange}
              />
              <CommandList>
                <CommandEmpty>
                  {sourceInput ? (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => handleSourceFreeText(sourceInput)}
                    >
                      {t('automations.actions.useAsFixedId', { value: sourceInput })}
                    </button>
                  ) : t('commandPalette.noResults')}
                </CommandEmpty>
                {triggerSeed && (
                  <CommandItem
                    value={triggerSeed.slug}
                    onSelect={() => handleSourceSelect(triggerSeed.slug)}
                    className="text-xs"
                  >
                    {triggerSeed.label}
                    <Badge variant="secondary" className="ml-2 text-[10px] py-0">
                      {t('automations.actions.thisSeed')}
                    </Badge>
                  </CommandItem>
                )}
                {seeds
                  .filter((s) => s.slug !== triggerSeedSlug)
                  .filter((s) => !sourceInput || s.slug.includes(sourceInput) || s.label.toLowerCase().includes(sourceInput.toLowerCase()))
                  .map((s) => (
                    <CommandItem
                      key={s.slug}
                      value={s.slug}
                      onSelect={() => handleSourceSelect(s.slug)}
                      className="text-xs"
                    >
                      {s.label}
                    </CommandItem>
                  ))}
                {sourceInput && !seeds.find((s) => s.slug === sourceInput) && (
                  <CommandItem
                    value={`__fixed__${sourceInput}`}
                    onSelect={() => handleSourceFreeText(sourceInput)}
                    className="text-xs text-muted-foreground"
                  >
                    {t('automations.actions.useAsFixedId', { value: sourceInput })}
                  </CommandItem>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {fixedId && (
          <div className="mt-1 flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] font-mono">
              ID: {fixedId}
            </Badge>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setValue(`actions.${index}.fixed_id` as any, '')
                setSourceInput('')
              }}
            >
              âœ•
            </button>
          </div>
        )}
      </div>

      {/* Column select â€” collection mode only */}
      {isCollectionMode && targetSeed && targetSeed.branches.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {t('automations.actions.column')}
          </label>
          <Select
            value={column ?? ''}
            onValueChange={(v) => setValue(`actions.${index}.column` as any, v === '__all__' ? '' : v)}
          >
            <SelectTrigger size="sm" className="h-8 text-sm">
              <SelectValue placeholder={t('automations.actions.columnAll')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('automations.actions.columnAll')}</SelectItem>
              {targetSeed.branches.map((b) => (
                <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filters â€” collection mode only */}
      {isCollectionMode && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('automations.actions.filters')}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => append({ field: '', op: 'eq', value: '' })}
            >
              <Plus className="size-3 mr-1" />
              {t('automations.editor.addCondition')}
            </Button>
          </div>
          {fields.map((field, fIdx) => {
            const fieldAlias = watch(`actions.${index}.filters.${fIdx}.field` as any) as string
            const op = watch(`actions.${index}.filters.${fIdx}.op` as any) as string
            const showValue = op !== 'isempty' && op !== 'isnotempty'

            return (
              <div key={field.id} className="flex gap-1.5 items-center mb-1.5">
                <Select
                  value={fieldAlias ?? ''}
                  onValueChange={(v) => setValue(`actions.${index}.filters.${fIdx}.field` as any, v)}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                    <SelectValue placeholder={t('automations.editor.conditionField')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(targetSeed?.branches ?? []).map((b) => (
                      <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={op ?? 'eq'}
                  onValueChange={(v) => setValue(`actions.${index}.filters.${fIdx}.op` as any, v)}
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

                {showValue && (
                  <Input
                    {...register(`actions.${index}.filters.${fIdx}.value` as any)}
                    placeholder="{{this.field}}"
                    className="h-7 text-xs flex-1 font-mono"
                  />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => remove(fIdx)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            )
          })}
          {fields.length === 0 && (
            <p className="text-[10px] text-muted-foreground">{t('automations.actions.noFilters')}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.filterTemplateHint')}</p>
        </div>
      )}

      {/* Template hint */}
      <div className="rounded border border-border/50 bg-muted/30 p-2">
        <p className="text-[10px] font-medium text-muted-foreground mb-1">
          {t('automations.actions.templateHintTitle')}
        </p>
        {fixedId ? (
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {t('automations.actions.hintFixed')}
          </pre>
        ) : (
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {t('automations.actions.hintCollection')}
          </pre>
        )}
      </div>
    </div>
  )
}
