import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DEFAULT_TRASH_RETENTION_DAYS, MAX_RETENTION_DAYS, isValidRetentionDays } from '@beechcms/core'
import { useGeneralSettings, useUpdateGeneralSettings } from './use-settings'
import { isApiError } from '@/lib/http/api-error'

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

    if (companyWebsite.trim()) {
      try {
        new URL(companyWebsite.trim())
      } catch {
        toast.error(t('setup.companyWebsiteRequired'))
        return
      }
    }

    const trimmedRetention = trashRetentionDays.trim()
    const retention = Number(trimmedRetention)
    if (!trimmedRetention || !isValidRetentionDays(retention)) {
      toast.error(t('settings.general.trashRetentionInvalid', { max: MAX_RETENTION_DAYS }))
      return
    }

    try {
      await updateSettings.mutateAsync({
        siteTitle: siteTitle.trim() || undefined,
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
      setCompanyWebsite,
      setCompanyAbbreviation,
      setTrashRetentionDays,
      handleSave,
    },
  }
}
