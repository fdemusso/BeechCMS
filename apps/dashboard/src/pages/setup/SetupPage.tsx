// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { TimezoneSelect, TIMEZONES } from '@/components/ui/timezone-select'
import { CurrencySelect } from '@/components/ui/currency-select'

interface SetupEnvironment {
  isDeveloper: boolean
  services: { mail: boolean; qstash: boolean }
}



function passwordStrength(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score += 20
  if (pw.length >= 12) score += 10
  if (pw.length >= 16) score += 10
  if (/[a-z]/.test(pw)) score += 15
  if (/[A-Z]/.test(pw)) score += 15
  if (/[0-9]/.test(pw)) score += 15
  if (/[^a-zA-Z0-9]/.test(pw)) score += 15
  return Math.min(score, 100)
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const active = step === current
        const done = step < current

        let base = ''
        if (active) {
          base = 'bg-slate-950 text-white font-semibold ring-2 ring-slate-950 ring-offset-2'
        } else if (done) {
          base = 'bg-slate-800 text-white'
        } else {
          base = 'bg-slate-200 text-slate-500'
        }

        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${base}`}
            >
              {step}
            </div>
            {step < total && (
              <div className={`h-px w-8 transition-all duration-300 ${done ? 'bg-slate-800' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [environment, setEnvironment] = useState<SetupEnvironment | null>(null)
  const [track, setTrack] = useState<'developer' | 'normal'>('normal')

  // Step 1
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState(() => {
    try {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (TIMEZONES.includes(localTz)) {
        return localTz
      }
    } catch {
      // ignore
    }
    return 'Europe/Rome'
  })
  const [currency, setCurrency] = useState('EUR')

  // Step 2
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  // Step 3
  const [loadDemoData, setLoadDemoData] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyAbbreviation, setCompanyAbbreviation] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingCaption, setLoadingCaption] = useState('')

  useEffect(() => {
    const html = document.documentElement
    const hadDark = html.classList.contains('dark')
    html.classList.remove('dark')
    return () => { if (hadDark) html.classList.add('dark') }
  }, [])

  useEffect(() => {
    axios.get('/auth/setup').then((res) => {
      const env: SetupEnvironment = res.data.environment
      setEnvironment(env)
      setTrack(env.isDeveloper ? 'developer' : 'normal')
    })
  }, [])

  const strength = passwordStrength(password)
  const strengthColor =
    strength < 40 ? 'bg-destructive' : strength < 70 ? 'bg-amber-500' : 'bg-green-500'
  const strengthLabel =
    strength < 40
      ? t('setup.strengthWeak')
      : strength < 70
        ? t('setup.strengthFair')
        : t('setup.strengthStrong')

  function goNext() {
    setError(null)
    if (step === 2) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError(t('setup.emailInvalid'))
        return
      }
      if (password.length < 8) {
        setError(t('setup.passwordTooShort'))
        return
      }
      if (password !== confirm) {
        setError(t('setup.passwordMismatch'))
        return
      }
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
  }

  async function handleFinish() {
    setError(null)
    if (track === 'normal') {
      if (!companyName.trim()) {
        setError(t('setup.companyNameRequired'))
        return
      }
      if (!companyWebsite.trim()) {
        setError(t('setup.companyWebsiteRequired'))
        return
      }
      try {
        new URL(companyWebsite.trim())
      } catch {
        setError(t('setup.companyWebsiteRequired'))
        return
      }
    }

    setSubmitting(true)
    setLoadingCaption(t('setup.loadingAccount'))

    if (loadDemoData) {
      setTimeout(() => setLoadingCaption(t('setup.loadingDemo')), 1500)
    }

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        surname: surname.trim(),
        email: email.trim().toLowerCase(),
        password,
        settings: { language, timezone, currency },
        track,
      }

      if (track === 'developer') {
        payload.loadDemoData = loadDemoData
      } else {
        payload.company = {
          name: companyName.trim(),
          website: companyWebsite.trim(),
          abbreviation: companyAbbreviation.trim() || undefined,
        }
      }

      await axios.post('/auth/setup', payload)
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      setSubmitting(false)
      if (axios.isAxiosError(err) && err.response?.data?.title) {
        setError(err.response.data.title)
      } else {
        setError(t('setup.errorFallback'))
      }
    }
  }

  if (submitting) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <Progress className="w-full animate-pulse" value={undefined} />
            <p className="text-sm text-muted-foreground">{loadingCaption}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{t('setup.title')}</CardTitle>
          <CardDescription>{t('setup.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <StepIndicator current={step} total={3} />

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">{t('setup.step1Title')}</p>

              {environment?.isDeveloper && (
                <div className="rounded-md border border-border bg-muted p-3 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t('setup.devAlertTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('setup.devAlertDesc')}</p>
                  <button
                    type="button"
                    className="text-xs underline text-foreground hover:opacity-80"
                    onClick={() => setTrack((t) => (t === 'developer' ? 'normal' : 'developer'))}
                  >
                    {track === 'developer' ? t('setup.switchToNormal') : t('setup.switchToDeveloper')}
                  </button>
                </div>
              )}

               <div className="space-y-2">
                <Label>{t('setup.languageLabel')}</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('setup.languagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 flex flex-col">
                <Label className="mb-1">{t('setup.timezoneLabel')}</Label>
                <TimezoneSelect value={timezone} onValueChange={setTimezone} />
              </div>

              <div className="space-y-2">
                <Label>{t('setup.currencyLabel')}</Label>
                <CurrencySelect value={currency} onValueChange={setCurrency} />
              </div>

              <Button className="w-full" onClick={goNext}>
                {t('setup.buttonNext')}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">{t('setup.step2Title')}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('setup.nameLabel')}</Label>
                  <Input
                    id="name"
                    placeholder={t('setup.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surname">{t('setup.surnameLabel')}</Label>
                  <Input
                    id="surname"
                    placeholder={t('setup.surnamePlaceholder')}
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('setup.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('setup.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('setup.passwordLabel')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('setup.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {password && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${strength}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">{t('setup.confirmLabel')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder={t('setup.confirmPlaceholder')}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setError(null); setStep(1) }}>
                  {t('setup.buttonBack')}
                </Button>
                <Button className="flex-1" onClick={goNext}>
                  {t('setup.buttonNext')}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">{t('setup.step3Title')}</p>

              {track === 'developer' ? (
                <>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                      {t('setup.servicesTitle')}
                    </p>
                    {environment && (
                      <>
                        <ServiceRow
                          label={t('setup.serviceMail')}
                          active={environment.services.mail}
                          activeLabel={t('setup.serviceActive')}
                          inactiveLabel={t('setup.serviceInactive')}
                        />
                        <ServiceRow
                          label={t('setup.serviceQstash')}
                          active={environment.services.qstash}
                          activeLabel={t('setup.serviceActive')}
                          inactiveLabel={t('setup.serviceInactive')}
                        />
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="loadDemo"
                      checked={loadDemoData}
                      onCheckedChange={(v) => setLoadDemoData(v === true)}
                    />
                    <Label htmlFor="loadDemo" className="cursor-pointer">
                      {t('setup.loadDemoLabel')}
                    </Label>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">{t('setup.companyNameLabel')}</Label>
                    <Input
                      id="companyName"
                      placeholder={t('setup.companyNamePlaceholder')}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyWebsite">{t('setup.companyWebsiteLabel')}</Label>
                    <Input
                      id="companyWebsite"
                      type="url"
                      placeholder={t('setup.companyWebsitePlaceholder')}
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyAbbreviation">{t('setup.companyAbbreviationLabel')}</Label>
                    <Input
                      id="companyAbbreviation"
                      placeholder={t('setup.companyAbbreviationPlaceholder')}
                      value={companyAbbreviation}
                      onChange={(e) => setCompanyAbbreviation(e.target.value)}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setError(null); setStep(2) }}>
                  {t('setup.buttonBack')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleFinish}
                >
                  {t('setup.buttonFinish')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ServiceRow({
  label,
  active,
  activeLabel,
  inactiveLabel,
}: {
  label: string
  active: boolean
  activeLabel: string
  inactiveLabel: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
      >
        {active ? activeLabel : inactiveLabel}
      </span>
    </div>
  )
}
