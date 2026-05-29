import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useGeneralSettings, useUpdateGeneralSettings } from './use-settings'

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

  useEffect(() => {
    if (settings) {
      setSiteTitle(settings.siteTitle ?? '')
      setDefaultLanguage(settings.defaultLanguage ?? 'en')
      setTimezone(settings.timezone ?? 'Europe/Rome')
      setCurrency(settings.currency ?? 'EUR')
      setCompanyName(settings.company?.name ?? '')
      setCompanyWebsite(settings.company?.website ?? '')
      setCompanyAbbreviation(settings.company?.abbreviation ?? '')
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
      })
      toast.success(t('settings.general.savedSuccess'))
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      const detail = axiosError?.response?.data?.detail ?? t('settings.general.savedError')
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
    },
    actions: {
      setSiteTitle,
      setDefaultLanguage,
      setTimezone,
      setCurrency,
      setCompanyName,
      setCompanyWebsite,
      setCompanyAbbreviation,
      handleSave,
    },
  }
}
