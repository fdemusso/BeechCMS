// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { AggregateFormula, Branch } from '@beechcms/core'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSchema } from '@/features/shared'

type TimeWindow = 'week' | 'month' | 'year' | 'all'

// â”€â”€ Generic field wrappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FieldRowProps {
  readonly label: string
  readonly children: React.ReactNode
}

export function FieldRow({ label, children }: FieldRowProps) {
  const id = React.useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {React.isValidElement(children) ? React.cloneElement(children, { id } as Partial<unknown>) : children}
    </div>
  )
}

export interface TextFieldProps {
  readonly label: string
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}

export function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <FieldRow label={label}>
      <Input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  )
}

export interface TextAreaFieldProps {
  readonly label: string
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly rows?: number
}

export function TextAreaField({ label, value, onChange, placeholder, rows = 4 }: TextAreaFieldProps) {
  return (
    <FieldRow label={label}>
      <textarea
        value={value ?? ''}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
    </FieldRow>
  )
}

export interface NumberFieldProps {
  readonly label: string
  readonly value: number | undefined
  readonly onChange: (value: number | undefined) => void
  readonly placeholder?: string
  readonly min?: number
  readonly max?: number
}

export function NumberField({ label, value, onChange, placeholder, min, max }: NumberFieldProps) {
  return (
    <FieldRow label={label}>
      <Input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === '' ? undefined : Number(raw))
        }}
      />
    </FieldRow>
  )
}

export interface SwitchFieldProps {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

export function SwitchField({ label, checked, onChange }: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export interface VariantOption {
  readonly value: string
  readonly labelKey: string
}

export interface VariantSelectProps {
  readonly label: string
  readonly value: string | undefined
  readonly options: readonly VariantOption[]
  readonly onChange: (value: string) => void
}

export function VariantSelect({ label, value, options, onChange }: VariantSelectProps) {
  const { t } = useTranslation()
  return (
    <FieldRow label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

// â”€â”€ SeedSelect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SeedSelectProps {
  readonly value: string | undefined
  readonly onChange: (slug: string) => void
  readonly label?: string
}

export function SeedSelect({ value, onChange, label }: SeedSelectProps) {
  const { t } = useTranslation()
  const { data: seeds } = useSchema()

  return (
    <FieldRow label={label ?? t('dashboard.builder.config.seed')}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('dashboard.builder.config.seedPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {(seeds ?? []).map((seed) => (
            <SelectItem key={seed.slug} value={seed.slug}>
              {seed.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

// â”€â”€ BranchAliasSelect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BranchAliasSelectProps {
  readonly seedSlug: string | undefined
  readonly value: string | undefined
  readonly onChange: (alias: string) => void
  readonly label?: string
  readonly filter?: (branch: Branch) => boolean
  readonly placeholder?: string
}

export function BranchAliasSelect({
  seedSlug,
  value,
  onChange,
  label,
  filter,
  placeholder,
}: BranchAliasSelectProps) {
  const { t } = useTranslation()
  const { data: seeds } = useSchema()

  const branches = React.useMemo(() => {
    const seed = (seeds ?? []).find((s) => s.slug === seedSlug)
    const all = seed?.branches ?? []
    return filter ? all.filter(filter) : all
  }, [seeds, seedSlug, filter])

  return (
    <FieldRow label={label ?? t('dashboard.builder.config.column')}>
      <Select value={value || undefined} onValueChange={onChange} disabled={!seedSlug}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder ?? t('dashboard.builder.config.columnPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.alias}>
              {branch.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

const NUMERIC_BRANCH_TYPES = new Set(['number'])
const isNumericBranch = (branch: Branch) => NUMERIC_BRANCH_TYPES.has(branch.type)

// â”€â”€ WindowSelect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface WindowSelectProps {
  readonly value: TimeWindow | undefined
  readonly onChange: (value: TimeWindow) => void
  readonly label?: string
}

export function WindowSelect({ value, onChange, label }: WindowSelectProps) {
  const { t } = useTranslation()
  return (
    <FieldRow label={label ?? t('dashboard.builder.config.window')}>
      <Select value={value ?? 'all'} onValueChange={(v) => onChange(v as TimeWindow)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">{t('dashboard.builder.config.windowWeek')}</SelectItem>
          <SelectItem value="month">{t('dashboard.builder.config.windowMonth')}</SelectItem>
          <SelectItem value="year">{t('dashboard.builder.config.windowYear')}</SelectItem>
          <SelectItem value="all">{t('dashboard.builder.config.windowAll')}</SelectItem>
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

// â”€â”€ FormulaEditor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type FormulaOp = AggregateFormula['op']

const FORMULA_OPS: FormulaOp[] = ['count', 'sum', 'avg', 'min', 'max', 'countWhere', 'percentageOf']

export interface FormulaEditorProps {
  readonly seedSlug: string | undefined
  readonly value: AggregateFormula | undefined
  readonly onChange: (formula: AggregateFormula | undefined) => void
  readonly label?: string
}

export function FormulaEditor({ seedSlug, value, onChange, label }: FormulaEditorProps) {
  const { t } = useTranslation()
  const op = value?.op ?? 'count'

  function setOp(nextOp: FormulaOp) {
    switch (nextOp) {
      case 'count':
        onChange({ op: 'count' })
        break
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
        onChange({ op: nextOp, column: '' })
        break
      case 'countWhere':
        onChange({ op: 'countWhere', column: '', value: '' })
        break
      case 'percentageOf':
        onChange({ op: 'percentageOf', numeratorColumn: '', denominatorColumn: '' })
        break
    }
  }

  return (
    <div className="space-y-2">
      <FieldRow label={label ?? t('dashboard.builder.config.formula')}>
        <Select value={op} onValueChange={(v) => setOp(v as FormulaOp)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMULA_OPS.map((opOption) => (
              <SelectItem key={opOption} value={opOption}>
                {t(`dashboard.builder.config.formulaOps.${opOption}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {(op === 'sum' || op === 'avg' || op === 'min' || op === 'max') && (
        <BranchAliasSelect
          seedSlug={seedSlug}
          value={value && 'column' in value ? value.column : undefined}
          onChange={(alias) => onChange({ op, column: alias })}
          filter={isNumericBranch}
          label={t('dashboard.builder.config.column')}
        />
      )}

      {op === 'countWhere' && (
        <>
          <BranchAliasSelect
            seedSlug={seedSlug}
            value={value && 'column' in value ? value.column : undefined}
            onChange={(alias) =>
              onChange({ op: 'countWhere', column: alias, value: value && 'value' in value ? value.value : '' })
            }
            label={t('dashboard.builder.config.column')}
          />
          <TextField
            label={t('dashboard.builder.config.matchValue')}
            value={value && 'value' in value ? String(value.value ?? '') : ''}
            onChange={(text) =>
              onChange({
                op: 'countWhere',
                column: value && 'column' in value ? value.column : '',
                value: text,
              })
            }
          />
        </>
      )}

      {op === 'percentageOf' && (
        <>
          <BranchAliasSelect
            seedSlug={seedSlug}
            value={value && 'numeratorColumn' in value ? value.numeratorColumn : undefined}
            onChange={(alias) =>
              onChange({
                op: 'percentageOf',
                numeratorColumn: alias,
                denominatorColumn: value && 'denominatorColumn' in value ? value.denominatorColumn : '',
              })
            }
            filter={isNumericBranch}
            label={t('dashboard.builder.config.numerator')}
          />
          <BranchAliasSelect
            seedSlug={seedSlug}
            value={value && 'denominatorColumn' in value ? value.denominatorColumn : undefined}
            onChange={(alias) =>
              onChange({
                op: 'percentageOf',
                numeratorColumn: value && 'numeratorColumn' in value ? value.numeratorColumn : '',
                denominatorColumn: alias,
              })
            }
            filter={isNumericBranch}
            label={t('dashboard.builder.config.denominator')}
          />
        </>
      )}
    </div>
  )
}
