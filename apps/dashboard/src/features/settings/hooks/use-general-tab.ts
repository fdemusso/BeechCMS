import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DEFAULT_TRASH_RETENTION_DAYS, MAX_RETENTION_DAYS, isValidRetentionDays } from '@beechcms/core'
import { useGeneralSettings, useUpdateGeneralSettings } from './use-settings'
import { isApiError } from '@/lib/http/api-error'

/** The fields the form can refuse, by name. */
export type GeneralTabField = 'companyWebsite' | 'trashRetentionDays'

export function useGeneralTabLogic() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useGeneralSettings()
  const updateSettings = useUpdateGeneralSettings()

  const [siteTitle, setSiteTitle] = useState('')
  const [defaultLanguage, setDefaultLanguage] = useState('en')
  const [timezone, setTimezone] = useState('Europe/Rome')
  const [currency, setCurrency] = useState('EUR')

  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyAbbreviation, setCompanyAbbreviation] = useState('')

  // A string, so the input can be empty while the user types.
  const [trashRetentionDays, setTrashRetentionDays] = useState(String(DEFAULT_TRASH_RETENTION_DAYS))

  // What was refused and why, per field; and how many times a save has been refused, so the page can move the
  // focus to the first bad field every time, not only the first.
  const [errors, setErrors] = useState<Partial<Record<GeneralTabField, string>>>({})
  const [refusals, setRefusals] = useState(0)
  const clearError = (field: GeneralTabField) => setErrors((current) => ({ ...current, [field]: undefined }))

  useEffect(() => {
    if (settings) {
      setSiteTitle(settings.siteTitle ?? '')
      setDefaultLanguage(settings.defaultLanguage ?? 'en')
      setTimezone(settings.timezone ?? 'Europe/Rome')
      setCurrency(settings.currency ?? 'EUR')
      setCompanyName(settings.company?.name ?? '')
      setCompanyWebsite(settings.company?.website ?? '')
      setCompanyAbbreviation(settings.company?.abbreviation ?? '')
      setTrashRetentionDays(String(settings.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS))
    }
  }, [settings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    const refused: Partial<Record<GeneralTabField, string>> = {}

    if (companyWebsite.trim()) {
      try {
        new URL(companyWebsite.trim())
      } catch {
        refused.companyWebsite = t('setup.companyWebsiteRequired')
      }
    }

    const trimmedRetention = trashRetentionDays.trim()
    const retention = Number(trimmedRetention)
    if (!trimmedRetention || !isValidRetentionDays(retention)) {
      refused.trashRetentionDays = t('settings.general.trashRetentionInvalid', { max: MAX_RETENTION_DAYS })
    }

    setErrors(refused)
    if (Object.keys(refused).length > 0) {
      setRefusals((count) => count + 1)
      return
    }

    try {
      await updateSettings.mutateAsync({
        siteTitle: siteTitle.trim() || null,
        defaultLanguage,
        timezone,
        currency,
        company: {
          name: companyName.trim() || null,
          website: companyWebsite.trim() || null,
          abbreviation: companyAbbreviation.trim() || null,
        },
        trashRetentionDays: retention,
      })
      toast.success(t('settings.general.savedSuccess'))
    } catch (err) {
      const detail = (isApiError(err) ? err.data?.detail : undefined) ?? t('settings.general.savedError')
      toast.error(detail)
    }
  }

  return {
    isLoading,
    isPending: updateSettings.isPending,
    errors,
    refusals,
    state: {
      siteTitle,
      defaultLanguage,
      timezone,
      currency,
      companyName,
      companyWebsite,
      companyAbbreviation,
      trashRetentionDays,
    },
    actions: {
      setSiteTitle,
      setDefaultLanguage,
      setTimezone,
      setCurrency,
      setCompanyName,
      setCompanyWebsite: (value: string) => { setCompanyWebsite(value); clearError('companyWebsite') },
      setCompanyAbbreviation,
      setTrashRetentionDays: (value: string) => { setTrashRetentionDays(value); clearError('trashRetentionDays') },
      handleSave,
    },
  }
}
