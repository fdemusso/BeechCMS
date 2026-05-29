// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useGeneralSettings, useUpdateGeneralSettings } from '../hooks/use-settings'

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [
      'Europe/Rome',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney',
    ]
  }
})()

function getTimezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    const tzPart = parts.find((part) => part.type === 'timeZoneName')
    const offset = tzPart ? tzPart.value.replace('GMT', 'UTC') : ''
    
    const tzParts = tz.split('/')
    const city = tzParts[tzParts.length - 1].replace('_', ' ')
    const region = tzParts.slice(0, -1).join('/')
    
    if (region) {
      return `${city} (${region}, ${offset})`
    }
    return offset ? `${city} (${offset})` : city
  } catch {
    return tz
  }
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK']

export function GeneralTab() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useGeneralSettings()
  const updateSettings = useUpdateGeneralSettings()

  const [siteTitle, setSiteTitle] = React.useState('')
  const [defaultLanguage, setDefaultLanguage] = React.useState('en')
  const [timezone, setTimezone] = React.useState('Europe/Rome')
  const [currency, setCurrency] = React.useState('EUR')

  const [companyName, setCompanyName] = React.useState('')
  const [companyWebsite, setCompanyWebsite] = React.useState('')
  const [companyAbbreviation, setCompanyAbbreviation] = React.useState('')

  const [openTimezone, setOpenTimezone] = React.useState(false)
  const timezoneListRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.title')}</CardTitle>
          <CardDescription>{t('settings.general.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">{t('settings.general.siteDefaultsTitle')}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t('settings.general.siteDefaultsDesc')}</p>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="defaultLanguage">{t('settings.general.languageLabel')}</Label>
                  <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                    <SelectTrigger id="defaultLanguage" className="w-full">
                      <SelectValue placeholder={t('settings.general.languagePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex flex-col justify-end">
                  <Label className="mb-1.5">{t('settings.general.timezoneLabel')}</Label>
                  <Popover open={openTimezone} onOpenChange={setOpenTimezone}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openTimezone}
                        className="w-full justify-between font-normal h-9 border-input bg-transparent text-sm"
                      >
                        <span className="truncate">
                          {timezone ? getTimezoneLabel(timezone) : t('settings.general.timezonePlaceholder')}
                        </span>
                        <ChevronsUpDown className="opacity-50 size-4 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t('setup.searchTimezonePlaceholder')}
                          onValueChange={() => {
                            if (timezoneListRef.current) {
                              timezoneListRef.current.scrollTop = 0
                            }
                          }}
                        />
                        <CommandList ref={timezoneListRef}>
                          <CommandEmpty>{t('setup.noTimezoneFound')}</CommandEmpty>
                          <CommandGroup className="max-h-60 overflow-y-auto">
                            {TIMEZONES.map((tz) => {
                              const label = getTimezoneLabel(tz)
                              const city = tz.split('/').pop()?.replace('_', ' ') || ''
                              const searchValue = `${city} ${tz}`
                              return (
                                <CommandItem
                                  key={tz}
                                  value={searchValue}
                                  onSelect={(currentValue) => {
                                    const matchedTz = TIMEZONES.find((t) => {
                                      const c = t.split('/').pop()?.replace('_', ' ') || ''
                                      return `${c} ${t}`.toLowerCase() === currentValue.toLowerCase()
                                    }) || tz
                                    setTimezone(matchedTz)
                                    setOpenTimezone(false)
                                  }}
                                >
                                  {label}
                                  <Check
                                    className={cn(
                                      "ml-auto size-4",
                                      timezone === tz ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">{t('settings.general.currencyLabel')}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency" className="w-full">
                      <SelectValue placeholder={t('settings.general.currencyPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3">{t('settings.general.companyInfoTitle')}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t('settings.general.companyInfoDesc')}</p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="siteTitle">{t('settings.general.siteTitleLabel')}</Label>
                  <Input
                    id="siteTitle"
                    value={siteTitle}
                    onChange={(e) => {
                      setSiteTitle(e.target.value)
                      setCompanyName(e.target.value)
                    }}
                    placeholder={t('settings.general.siteTitlePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyAbbreviation">{t('settings.general.companyAbbreviationLabel')}</Label>
                  <Input
                    id="companyAbbreviation"
                    value={companyAbbreviation}
                    onChange={(e) => setCompanyAbbreviation(e.target.value)}
                    placeholder={t('settings.general.companyAbbreviationPlaceholder')}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="companyWebsite">{t('settings.general.companyWebsiteLabel')}</Label>
                  <Input
                    id="companyWebsite"
                    type="url"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder={t('settings.general.companyWebsitePlaceholder')}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.general.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
