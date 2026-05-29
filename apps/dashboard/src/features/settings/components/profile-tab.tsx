// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useProfile, useUpdateProfile, useChangePassword, useUpdateAvatar, useGeneralSettings, useUpdateGeneralSettings } from '../hooks/use-settings'

const TIMEZONES = (() => {
  try { return Intl.supportedValuesOf('timeZone') } catch {
    return ['Europe/Rome','Europe/London','Europe/Paris','Europe/Berlin','UTC','America/New_York','America/Chicago','America/Los_Angeles','Asia/Tokyo','Asia/Shanghai','Australia/Sydney']
  }
})()

function getTimezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const offset = (parts.find(p => p.type === 'timeZoneName')?.value ?? '').replace('GMT', 'UTC')
    const tzParts = tz.split('/')
    const city = tzParts[tzParts.length - 1].replace('_', ' ')
    const region = tzParts.slice(0, -1).join('/')
    return region ? `${city} (${region}, ${offset})` : offset ? `${city} (${offset})` : city
  } catch { return tz }
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK']

function getInitials(name: string | null, surname: string | null, email: string): string {
  if (name || surname) {
    const parts = []
    if (name) parts.push(name.trim())
    if (surname) parts.push(surname.trim())
    return parts.map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }
  return email.slice(0, 2).toUpperCase()
}

export function ProfileTab() {
  const { t } = useTranslation()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const updateAvatar = useUpdateAvatar()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { data: generalSettings } = useGeneralSettings()
  const updateGeneralSettings = useUpdateGeneralSettings()
  const timezoneListRef = React.useRef<HTMLDivElement>(null)

  const [name, setName] = React.useState('')
  const [surname, setSurname] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  const [defaultLanguage, setDefaultLanguage] = React.useState('en')
  const [timezone, setTimezone] = React.useState('Europe/Rome')
  const [currency, setCurrency] = React.useState('EUR')
  const [siteTitle, setSiteTitle] = React.useState('')
  const [companyAbbreviation, setCompanyAbbreviation] = React.useState('')
  const [companyWebsite, setCompanyWebsite] = React.useState('')
  const [openTimezone, setOpenTimezone] = React.useState(false)

  React.useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setSurname(profile.surname ?? '')
      setEmail(profile.email)
    }
  }, [profile])

  React.useEffect(() => {
    if (generalSettings) {
      setDefaultLanguage(generalSettings.defaultLanguage ?? 'en')
      setTimezone(generalSettings.timezone ?? 'Europe/Rome')
      setCurrency(generalSettings.currency ?? 'EUR')
      setSiteTitle(generalSettings.siteTitle ?? '')
      setCompanyAbbreviation(generalSettings.company?.abbreviation ?? '')
      setCompanyWebsite(generalSettings.company?.website ?? '')
    }
  }, [generalSettings])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile.mutateAsync({
        name: name || undefined,
        surname: surname || undefined,
        email: email || undefined,
      })
      toast.success(t('settings.profile.savedSuccess'))
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      const detail = axiosError?.response?.data?.detail ?? t('settings.profile.savedError')
      toast.error(detail)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.profile.passwordMismatch'))
      return
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      toast.success(t('settings.profile.passwordSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      const detail = axiosError?.response?.data?.detail ?? t('settings.profile.passwordError')
      toast.error(detail)
    }
  }

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (companyWebsite.trim()) {
      try { new URL(companyWebsite.trim()) } catch {
        toast.error(t('setup.companyWebsiteRequired'))
        return
      }
    }
    try {
      await updateGeneralSettings.mutateAsync({
        siteTitle: siteTitle.trim() || undefined,
        defaultLanguage,
        timezone,
        currency,
        company: {
          name: siteTitle.trim() || null,
          website: companyWebsite.trim() || null,
          abbreviation: companyAbbreviation.trim() || null,
        },
      })
      toast.success(t('settings.general.savedSuccess'))
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosError?.response?.data?.detail ?? t('settings.general.savedError'))
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await updateAvatar.mutateAsync(file)
      toast.success(t('settings.profile.avatarSuccess'))
    } catch {
      toast.error(t('settings.profile.avatarError'))
    }
    e.target.value = ''
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
          <CardTitle>{t('settings.profile.infoTitle')}</CardTitle>
          <CardDescription>{t('settings.profile.infoDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="size-20">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(profile?.name ?? null, profile?.surname ?? null, profile?.email ?? '')}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={updateAvatar.isPending}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {updateAvatar.isPending
                    ? <Loader2 className="size-5 text-white animate-spin" />
                    : <Camera className="size-5 text-white" />
                  }
                </button>
              </div>
              <div>
                <p className="text-sm font-medium">
                  {profile?.name
                    ? `${profile.name}${profile.surname ? ' ' + profile.surname : ''}`
                    : t('settings.profile.noName')}
                </p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  {t('settings.profile.changePhoto')}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('settings.profile.nameLabel')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('settings.profile.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surname">{t('settings.profile.surnameLabel')}</Label>
                <Input
                  id="surname"
                  value={surname}
                  onChange={e => setSurname(e.target.value)}
                  placeholder={t('settings.profile.surnamePlaceholder')}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">{t('settings.profile.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('settings.profile.emailPlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.profile.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.title')}</CardTitle>
          <CardDescription>{t('settings.general.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveGeneralSettings} className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">{t('settings.general.siteDefaultsTitle')}</h3>
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

                <div className="space-y-2">
                  <Label>{t('settings.general.timezoneLabel')}</Label>
                  <Popover open={openTimezone} onOpenChange={setOpenTimezone}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={openTimezone}
                        className="w-full justify-between font-normal h-9 border-input bg-transparent text-sm">
                        <span className="truncate">
                          {timezone ? getTimezoneLabel(timezone) : t('settings.general.timezonePlaceholder')}
                        </span>
                        <ChevronsUpDown className="opacity-50 size-4 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('setup.searchTimezonePlaceholder')}
                          onValueChange={() => { if (timezoneListRef.current) timezoneListRef.current.scrollTop = 0 }} />
                        <CommandList ref={timezoneListRef}>
                          <CommandEmpty>{t('setup.noTimezoneFound')}</CommandEmpty>
                          <CommandGroup className="max-h-60 overflow-y-auto">
                            {TIMEZONES.map((tz) => {
                              const city = tz.split('/').pop()?.replace('_', ' ') || ''
                              return (
                                <CommandItem key={tz} value={`${city} ${tz}`}
                                  onSelect={(val) => {
                                    const matched = TIMEZONES.find(t => {
                                      const c = t.split('/').pop()?.replace('_', ' ') || ''
                                      return `${c} ${t}`.toLowerCase() === val.toLowerCase()
                                    }) || tz
                                    setTimezone(matched)
                                    setOpenTimezone(false)
                                  }}>
                                  {getTimezoneLabel(tz)}
                                  <Check className={cn('ml-auto size-4', timezone === tz ? 'opacity-100' : 'opacity-0')} />
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
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3">{t('settings.general.companyInfoTitle')}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="siteTitle">{t('settings.general.siteTitleLabel')}</Label>
                  <Input id="siteTitle" value={siteTitle}
                    onChange={e => setSiteTitle(e.target.value)}
                    placeholder={t('settings.general.siteTitlePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAbbreviation">{t('settings.general.companyAbbreviationLabel')}</Label>
                  <Input id="companyAbbreviation" value={companyAbbreviation}
                    onChange={e => setCompanyAbbreviation(e.target.value)}
                    placeholder={t('settings.general.companyAbbreviationPlaceholder')} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="companyWebsite">{t('settings.general.companyWebsiteLabel')}</Label>
                  <Input id="companyWebsite" type="url" value={companyWebsite}
                    onChange={e => setCompanyWebsite(e.target.value)}
                    placeholder={t('settings.general.companyWebsitePlaceholder')} />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateGeneralSettings.isPending}>
                {updateGeneralSettings.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.general.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile.passwordTitle')}</CardTitle>
          <CardDescription>{t('settings.profile.passwordDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t('settings.profile.currentPassword')}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('settings.profile.newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('settings.profile.confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={changePassword.isPending}>
                {changePassword.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.profile.updatePassword')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
