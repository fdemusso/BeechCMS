// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ReactNode } from 'react'

export type FormBranchType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'date'
  | 'file'
  | 'email'

export type ConditionalOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains'

export interface ConditionalRule {
  field: string
  op: ConditionalOperator
  value?: unknown
}

export interface FormBranchSchema {
  alias: string
  type: FormBranchType
  label?: string
  placeholder?: string
  required?: boolean
  options?: Array<{ label: string; value: string | number }>
  defaultValue?: unknown
  dependsOn?: ConditionalRule | ConditionalRule[]
  accept?: string
  maxSizeMb?: number
  helpText?: string
}

export interface FormSeedSchema {
  slug: string
  label?: string
  branches: FormBranchSchema[]
}

export interface FormFileAttachment {
  filename: string
  mimeType: string
  data: string // base64 encoded content
}

export interface FormTranslations {
  submitButton: string
  submittingButton: string
  successTitle: string
  successMessage: string
  errorTitle: string
  genericErrorMessage: string
  requiredField: string
  invalidEmail: string
  invalidNumber: string
  invalidFileType: string
  fileTooLarge: (maxMb: number) => string
  draftRestored: string
  timeTrapWarning: string
  honeypotLabel: string
}

export type Locale = 'it' | 'en'

export interface UseBeechFormOptions<TValues extends Record<string, unknown> = Record<string, unknown>> {
  seed: string | FormSeedSchema
  baseUrl?: string
  apiKey?: string
  locale?: Locale
  translations?: Partial<FormTranslations>
  initialValues?: Partial<TValues>
  disableDraft?: boolean
  disableAntiBot?: boolean
  honeypotField?: string
  onSuccess?: (result: { id?: string; data: TValues }) => void
  onError?: (error: { status: number; message: string; details?: unknown }) => void
}

export interface FormFieldState {
  value: unknown
  error?: string
  touched: boolean
  visible: boolean
}

export interface UseBeechFormReturn<TValues extends Record<string, unknown> = Record<string, unknown>> {
  seedSlug: string
  values: TValues
  errors: Record<string, string | undefined>
  touched: Record<string, boolean | undefined>
  isSubmitting: boolean
  isSuccess: boolean
  isDraftRestored: boolean
  serverError: string | null
  timeTrapReady: boolean
  honeypotName: string
  honeypotValue: string
  translations: FormTranslations
  setFieldValue: (field: string, value: unknown) => void
  setFieldTouched: (field: string, isTouched?: boolean) => void
  setFieldError: (field: string, error?: string) => void
  setHoneypotValue: (value: string) => void
  isFieldVisible: (field: string) => boolean
  register: (field: string) => {
    name: string
    value: string | number | readonly string[] | undefined
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
    onBlur: () => void
    'aria-invalid'?: boolean
    'aria-required'?: boolean
    'aria-describedby'?: string
  }
  handleFileChange: (field: string, file: File | null) => Promise<void>
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => Promise<boolean>
  reset: () => void
  clearDraft: () => void
}

export interface BeechFormProps<TValues extends Record<string, unknown> = Record<string, unknown>>
  extends UseBeechFormOptions<TValues> {
  className?: string
  children?: ReactNode | ((form: UseBeechFormReturn<TValues>) => ReactNode)
}

export interface FormFieldProps {
  branch: FormBranchSchema
  form: UseBeechFormReturn
  className?: string
}

export interface HoneypotFieldProps {
  name: string
  value: string
  onChange: (value: string) => void
  label?: string
}
