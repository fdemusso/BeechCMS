// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormBranchSchema, FormSeedSchema, UseBeechFormOptions, UseBeechFormReturn } from '../types.js'
import { DEFAULT_HONEYPOT_NAME } from '../core/honeypot.js'
import { fetchTimeTrapToken } from '../core/time-trap.js'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../core/draft-storage.js'
import { evaluateCondition } from '../core/conditional-logic.js'
import { fileToAttachment } from '../core/file-uploader.js'
import { getTranslations } from '../i18n/translations.js'

export function useBeechForm<TValues extends Record<string, unknown> = Record<string, unknown>>(
  options: UseBeechFormOptions<TValues>
): UseBeechFormReturn<TValues> {
  const {
    seed,
    baseUrl = '',
    apiKey = '',
    locale = 'it',
    translations: customTranslations,
    initialValues = {},
    disableDraft = false,
    disableAntiBot = false,
    honeypotField = DEFAULT_HONEYPOT_NAME,
    includeFields,
    excludeFields,
    onSuccess,
    onError,
  } = options

  const seedSlug = typeof seed === 'string' ? seed : seed.slug

  const [schema, setSchema] = useState<FormSeedSchema | null>(() => {
    if (typeof seed === 'object') return seed
    try {
      if (typeof window !== 'undefined') {
        const raw = window.sessionStorage?.getItem(`beech_schema_${seedSlug}`) || window.localStorage?.getItem(`beech_schema_${seedSlug}`)
        if (raw) return JSON.parse(raw)
      }
    } catch {}
    return null
  })

  const [isLoadingSchema, setIsLoadingSchema] = useState<boolean>(() => {
    if (typeof seed === 'object') return false
    try {
      if (typeof window !== 'undefined') {
        const cached = window.sessionStorage?.getItem(`beech_schema_${seedSlug}`) || window.localStorage?.getItem(`beech_schema_${seedSlug}`)
        if (cached) return false
      }
    } catch {}
    return typeof seed === 'string' && !!baseUrl
  })

  const translations = useMemo(() => getTranslations(locale, customTranslations), [locale, customTranslations])

  // Fetch scoped schema dynamically with SWR background revalidation
  useEffect(() => {
    if (typeof seed === 'object') {
      setSchema(seed)
      setIsLoadingSchema(false)
      return
    }

    if (typeof seed === 'string' && baseUrl) {
      const cleanBase = baseUrl.replace(/\/+$/, '')
      const headers: Record<string, string> = {}
      if (apiKey) headers['X-API-Key'] = apiKey

      fetch(`${cleanBase}/api/v1/public/${encodeURIComponent(seedSlug)}/schema`, { headers })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<{ slug: string; label?: string; branches?: Array<Record<string, unknown>> }>
        })
        .then((found) => {
          if (found && Array.isArray(found.branches)) {
            const rawBranches = found.branches.filter((b) => {
              const alias = String(b.alias || '')
              if (includeFields && includeFields.length > 0 && !includeFields.includes(alias)) return false
              if (excludeFields && excludeFields.includes(alias)) return false
              return true
            })

            const adaptedBranches: FormBranchSchema[] = rawBranches.map((b) => {
              const alias = String(b.alias || '')
              const typeStr = String(b.type || '')
              const label = typeof b.label === 'string' ? b.label : alias
              const optionsList = Array.isArray(b.options)
                ? (b.options as Array<{ label: string; value: string | number } | string>).map((opt) =>
                    typeof opt === 'string' ? { label: opt, value: opt } : opt
                  )
                : undefined
              const formType =
                typeStr === 'email'
                  ? 'email'
                  : typeStr === 'file'
                  ? 'file'
                  : typeStr === 'number'
                  ? 'number'
                  : typeStr === 'boolean'
                  ? 'boolean'
                  : optionsList && optionsList.length > 0
                  ? 'select'
                  : typeStr === 'text' && (alias === 'message' || alias === 'description')
                  ? 'text'
                  : 'string'

              return {
                alias,
                type: formType,
                label,
                required: Boolean(b.requiredOnCreate ?? b.required),
                placeholder: typeof b.placeholder === 'string' ? b.placeholder : undefined,
                options: optionsList,
                helpText: typeof b.helpText === 'string' ? b.helpText : undefined,
                accept: typeof b.accept === 'string' ? b.accept : undefined,
              }
            })

            const resolved: FormSeedSchema = {
              slug: found.slug,
              label: found.label,
              branches: adaptedBranches,
            }

            setSchema(resolved)
            try {
              if (typeof window !== 'undefined') {
                window.sessionStorage?.setItem(`beech_schema_${seedSlug}`, JSON.stringify(resolved))
              }
            } catch {}
          }
        })
        .catch((err) => {
          console.error(`Failed to load schema for seed '${seedSlug}':`, err)
        })
        .finally(() => {
          setIsLoadingSchema(false)
        })
    }
  }, [seed, seedSlug, baseUrl, apiKey, includeFields, excludeFields])

  const [values, setValues] = useState<TValues>(() => {
    const base = { ...initialValues } as TValues
    if (!disableDraft) {
      const saved = loadFormDraft<TValues>(seedSlug)
      if (saved) return { ...base, ...saved }
    }
    return base
  })

  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [touched, setTouched] = useState<Record<string, boolean | undefined>>({})
  const [attachments, setAttachments] = useState<Record<string, { filename: string; mimeType: string; data: string }>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isDraftRestored, setIsDraftRestored] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Anti-Bot: Honeypot State
  const [honeypotValue, setHoneypotValue] = useState('')

  // Anti-Bot: Time Trap State
  const [timeTrapToken, setTimeTrapToken] = useState<string | null>(null)
  const mountTimeRef = useRef<number>(Date.now())

  // Initial mount: load draft indicator & fetch time-trap token
  useEffect(() => {
    mountTimeRef.current = Date.now()
    if (!disableDraft) {
      const saved = loadFormDraft<TValues>(seedSlug)
      if (saved && Object.keys(saved).length > 0) {
        setIsDraftRestored(true)
      }
    }

    if (!disableAntiBot && baseUrl) {
      fetchTimeTrapToken(baseUrl).then((res) => {
        if (res) {
          setTimeTrapToken(res.token)
          mountTimeRef.current = res.timestamp
        }
      })
    }
  }, [seedSlug, baseUrl, disableDraft, disableAntiBot])

  // Real-time auto-save draft
  useEffect(() => {
    if (!disableDraft && !isSuccess) {
      saveFormDraft(seedSlug, values)
    }
  }, [seedSlug, values, disableDraft, isSuccess])

  const setFieldValue = useCallback((field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const setFieldTouched = useCallback((field: string, isTouched = true) => {
    setTouched((prev) => ({ ...prev, [field]: isTouched }))
  }, [])

  const setFieldError = useCallback((field: string, error?: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      if (error) next[field] = error
      else delete next[field]
      return next
    })
  }, [])

  const isFieldVisible = useCallback(
    (field: string): boolean => {
      if (!schema) return true
      const branch = schema.branches.find((b) => b.alias === field)
      if (!branch || !branch.dependsOn) return true
      return evaluateCondition(branch.dependsOn, values)
    },
    [schema, values]
  )

  const register = useCallback(
    (field: string) => {
      const fieldError = errors[field]
      const isFieldTouched = touched[field]
      const branch = schema?.branches.find((b) => b.alias === field)
      const isRequired = branch?.required ?? false

      const rawVal = values[field]
      let formValue: string | number | readonly string[] | undefined
      if (typeof rawVal === 'string' || typeof rawVal === 'number' || Array.isArray(rawVal)) {
        formValue = rawVal
      } else if (rawVal === undefined || rawVal === null) {
        formValue = ''
      } else {
        formValue = String(rawVal)
      }

      return {
        name: field,
        value: formValue,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
          const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
          setFieldValue(field, val)
        },
        onBlur: () => setFieldTouched(field, true),
        'aria-invalid': !!(isFieldTouched && fieldError),
        'aria-required': isRequired,
        'aria-describedby': fieldError ? `${field}-error` : undefined,
      }
    },
    [errors, touched, schema, values, setFieldValue, setFieldTouched]
  )

  const handleFileChange = useCallback(
    async (field: string, file: File | null) => {
      if (!file) {
        setFieldValue(field, null)
        setAttachments((prev) => {
          const next = { ...prev }
          delete next[field]
          return next
        })
        return
      }

      const branch = schema?.branches.find((b) => b.alias === field)
      if (branch?.maxSizeMb && file.size > branch.maxSizeMb * 1024 * 1024) {
        setFieldError(field, translations.fileTooLarge(branch.maxSizeMb))
        return
      }

      const { attachment, error } = await fileToAttachment(file)
      if (error) {
        setFieldError(field, translations.invalidFileType)
        return
      }

      setAttachments((prev) => ({ ...prev, [field]: attachment }))
      setFieldValue(field, file.name)
    },
    [schema, translations, setFieldValue, setFieldError]
  )

  const validate = useCallback((): boolean => {
    const nextErrors: Record<string, string | undefined> = {}
    if (schema) {
      for (const branch of schema.branches) {
        if (!isFieldVisible(branch.alias)) continue
        const val = values[branch.alias]
        if (branch.required) {
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            nextErrors[branch.alias] = translations.requiredField
          }
        }
        if (branch.type === 'email' && typeof val === 'string' && val.trim() !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(val)) {
            nextErrors[branch.alias] = translations.invalidEmail
          }
        }
        if (branch.type === 'number' && val !== undefined && val !== null && val !== '') {
          if (isNaN(Number(val))) {
            nextErrors[branch.alias] = translations.invalidNumber
          }
        }
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [schema, isFieldVisible, values, translations])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>): Promise<boolean> => {
      if (e) e.preventDefault()
      setServerError(null)

      if (!validate()) {
        if (schema) {
          const allTouched: Record<string, boolean> = {}
          for (const b of schema.branches) {
            allTouched[b.alias] = true
          }
          setTouched((prev) => ({ ...prev, ...allTouched }))
        }
        return false
      }

      // Check Honeypot Trap
      if (honeypotValue.trim() !== '') {
        setServerError(translations.genericErrorMessage)
        onError?.({ status: 422, message: 'Bot submission rejected' })
        return false
      }

      // Check Time Trap Delta on client (< 1.5s)
      const elapsedSeconds = (Date.now() - mountTimeRef.current) / 1000
      if (!disableAntiBot && elapsedSeconds < 1.5) {
        setServerError(translations.timeTrapWarning)
        onError?.({ status: 422, message: 'Time trap delta violation' })
        return false
      }

      setIsSubmitting(true)

      try {
        // Construct sanitized public payload: filter out hidden conditional fields
        const payloadData: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(values)) {
          if (isFieldVisible(k)) {
            payloadData[k] = v
          }
        }

        const requestBody: Record<string, unknown> = {
          data: payloadData,
        }

        if (timeTrapToken) {
          requestBody._timeTrapToken = timeTrapToken
        }

        const attachmentList = Object.values(attachments)
        if (attachmentList.length > 0) {
          requestBody.attachments = attachmentList
        }

        const cleanBase = baseUrl.replace(/\/+$/, '')
        const endpoint = `${cleanBase}/api/v1/public/${encodeURIComponent(seedSlug)}/add`

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
          },
          body: JSON.stringify(requestBody),
        })

        const json = await response.json().catch(() => null)

        if (!response.ok) {
          const detail = json?.detail || json?.title || translations.genericErrorMessage
          setServerError(detail)
          onError?.({ status: response.status, message: detail, details: json })
          return false
        }

        setIsSuccess(true)
        clearFormDraft(seedSlug)
        onSuccess?.({ id: json?.data?.id, data: values })
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : translations.genericErrorMessage
        setServerError(msg)
        onError?.({ status: 0, message: msg, details: err })
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      validate,
      honeypotValue,
      translations,
      disableAntiBot,
      values,
      isFieldVisible,
      timeTrapToken,
      attachments,
      baseUrl,
      seedSlug,
      apiKey,
      onSuccess,
      onError,
    ]
  )

  const reset = useCallback(() => {
    setValues({ ...initialValues } as TValues)
    setErrors({})
    setTouched({})
    setAttachments({})
    setServerError(null)
    setIsSuccess(false)
    setHoneypotValue('')
    clearFormDraft(seedSlug)
  }, [initialValues, seedSlug])

  const clearDraft = useCallback(() => {
    clearFormDraft(seedSlug)
    setIsDraftRestored(false)
  }, [seedSlug])

  return {
    seedSlug,
    schema,
    isLoadingSchema,
    values,
    errors,
    touched,
    isSubmitting,
    isSuccess,
    isDraftRestored,
    serverError,
    timeTrapReady: !!timeTrapToken,
    honeypotName: honeypotField,
    honeypotValue,
    translations,
    setFieldValue,
    setFieldTouched,
    setFieldError,
    setHoneypotValue,
    isFieldVisible,
    register,
    handleFileChange,
    handleSubmit,
    reset,
    clearDraft,
  }
}
