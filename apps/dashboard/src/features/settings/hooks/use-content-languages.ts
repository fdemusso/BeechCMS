// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useGeneralSettings, useUpdateGeneralSettings } from "./use-settings"
import { addContentLanguage, removeContentLanguage, type AddContentLanguageError } from "../lib/content-languages"

export function useContentLanguages() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useGeneralSettings()
  const updateSettings = useUpdateGeneralSettings()

  const [locales, setLocales] = useState<string[]>([])
  const [defaultLocale, setDefaultLocale] = useState("")
  const [draft, setDraft] = useState("")
  const [draftError, setDraftError] = useState<AddContentLanguageError | null>(null)

  useEffect(() => {
    if (settings) {
      setLocales(settings.locales)
      setDefaultLocale(settings.defaultLocale)
    }
  }, [settings])

  const isDirty = settings !== undefined && (
    defaultLocale !== settings.defaultLocale || locales.join(",") !== settings.locales.join(",")
  )

  const add = () => {
    const result = addContentLanguage(locales, draft)
    if (!result.ok) {
      setDraftError(result.error)
      return
    }
    setLocales(result.locales)
    setDraft("")
    setDraftError(null)
  }

  const remove = (code: string) => setLocales((current) => removeContentLanguage(current, defaultLocale, code))

  const save = async () => {
    try {
      // Only the two locale keys: the General form owns the other settings and is saved separately.
      await updateSettings.mutateAsync({ locales, defaultLocale })
      toast.success(t("settings.contentLanguages.savedSuccess"))
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosError?.response?.data?.detail ?? t("settings.contentLanguages.savedError"))
    }
  }

  return {
    isLoading,
    isPending: updateSettings.isPending,
    state: { locales, defaultLocale, draft, draftError, isDirty },
    actions: {
      setDraft: (value: string) => { setDraft(value); setDraftError(null) },
      add,
      remove,
      setDefaultLocale,
      save,
    },
  }
}
