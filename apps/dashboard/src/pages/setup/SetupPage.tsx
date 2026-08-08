// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import axios from 'axios'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Eye, EyeOff } from 'reicon-react'
import { TimezoneSelect } from '@/components/ui/timezone-select'
import { TIMEZONES } from '@/components/ui/timezone-utils'
import { CurrencySelect } from '@/components/ui/currency-select'
import { LanguageSelect } from '@/components/ui/language-select'

interface SetupEnvironment {
  isDeveloper: boolean
  services: { mail: boolean; qstash: boolean }
}

// Leet-speak substitution table for normalized matching
const LEET_MAP: Record<string, string> = {
  '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i',
  '0': 'o', '$': 's', '5': 's', '7': 't', '9': 'g', '8': 'b',
}

// Common keyboard row sequences (QWERTY + QWERTZ)
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertzuiop']

function normLeet(s: string): string {
  return s.toLowerCase().split('').map(c => LEET_MAP[c] ?? c).join('')
}

// Returns the length of the longest consecutive keyboard-row walk (forward or backward)
function longestKbWalk(pw: string): number {
  const s = pw.toLowerCase()
  let max = 1
  for (const row of KB_ROWS) {
    for (let i = 0; i < s.length - 1; i++) {
      let run = 1, dir = 0
      for (let j = i + 1; j < s.length; j++) {
        const a = row.indexOf(s[j - 1]), b = row.indexOf(s[j])
        if (a < 0 || b < 0) break
        const step = b - a
        if (step === 0) break
        if (dir === 0) dir = Math.sign(step)
        if (Math.sign(step) !== dir || Math.abs(step) !== 1) break
        run++
      }
      if (run > max) max = run
    }
  }
  return max
}

// Returns the longest run of the same character repeated consecutively
function maxRepeatRun(pw: string): number {
  let max = 1, run = 1
  for (let i = 1; i < pw.length; i++) {
    run = pw[i].toLowerCase() === pw[i - 1].toLowerCase() ? run + 1 : 1
    if (run > max) max = run
  }
  return max
}

// Returns the longest ascending/descending sequence within the same character class
function maxSeqRun(pw: string): number {
  let max = 1, run = 1
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1)
    const sameClass =
      (/[a-zA-Z]/.test(pw[i]) && /[a-zA-Z]/.test(pw[i - 1])) ||
      (/[0-9]/.test(pw[i]) && /[0-9]/.test(pw[i - 1]))
    run = sameClass && (diff === 1 || diff === -1) ? run + 1 : 1
    if (run > max) max = run
  }
  return max
}

// Computes penalty for personal info, with tiered severity:
//   direct/reversed match → -30, leet-normalized match → -20, partial substring (≥4 chars) → -10
function personalInfoPenalty(pw: string, tokens: string[]): number {
  const lower = pw.toLowerCase()
  const normed = normLeet(pw)
  let penalty = 0
  const seen = new Set<string>()

  for (const raw of tokens) {
    const t = raw.trim().toLowerCase()
    if (t.length < 3 || seen.has(t)) continue
    seen.add(t)

    const rev = t.split('').reverse().join('')
    const tNorm = normLeet(t)

    if (lower.includes(t) || lower.includes(rev)) {
      penalty += 30
    } else if (normed.includes(tNorm)) {
      penalty += 20
    } else if (t.length >= 5) {
      // Check if any substring of length ≥ 4 is present (catch partial name leaks)
      outer: for (let len = t.length - 1; len >= 4; len--) {
        for (let start = 0; start <= t.length - len; start++) {
          if (lower.includes(t.slice(start, start + len))) {
            penalty += 10
            break outer
          }
        }
      }
    }
  }

  return penalty
}

function passwordStrength(pw: string, name?: string, surname?: string, email?: string): number {
  if (!pw) return 0

  let score = 0

  // Length bonuses — max 40 pts
  if (pw.length >= 8)  score += 10
  if (pw.length >= 10) score += 10
  if (pw.length >= 12) score += 10
  if (pw.length >= 16) score += 10

  // Character variety — max 50 pts
  const hasLc  = /[a-z]/.test(pw)
  const hasUc  = /[A-Z]/.test(pw)
  const hasNum = /[0-9]/.test(pw)
  const hasSym = /[^a-zA-Z0-9]/.test(pw)
  const classes = [hasLc, hasUc, hasNum, hasSym].filter(Boolean).length

  if (hasLc)        score += 10
  if (hasUc)        score += 10
  if (hasNum)       score += 10
  if (hasSym)       score += 15
  if (classes >= 3) score += 5 // bonus for genuine variety

  // Character entropy — max 10 pts (penalizes low unique-char density)
  const uniqueRatio = new Set(pw.toLowerCase()).size / pw.length
  if (uniqueRatio >= 0.8)      score += 10
  else if (uniqueRatio >= 0.6) score += 5

  // --- Penalties ---
  let penalty = 0

  // Personal info (direct, reversed, leet-normalized, partial)
  const emailLocal = email ? email.trim().split('@')[0] : undefined
  const tokens = [name, surname, email, emailLocal].filter(Boolean) as string[]
  penalty += personalInfoPenalty(pw, tokens)

  // Keyboard walk patterns (qwerty, 12345, asdf…)
  const walk = longestKbWalk(pw)
  if (walk >= 5)      penalty += 25
  else if (walk >= 4) penalty += 15

  // Repeated characters (aaaa, 1111…)
  const repeat = maxRepeatRun(pw)
  if (repeat >= 4)      penalty += 20
  else if (repeat >= 3) penalty += 10

  // Sequential characters (abcd, 1234, zyxw…)
  const seq = maxSeqRun(pw)
  if (seq >= 5)      penalty += 20
  else if (seq >= 4) penalty += 10

  return Math.max(0, Math.min(score - penalty, 100))
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
          base = 'bg-primary text-primary-foreground font-semibold ring-2 ring-primary ring-offset-2'
        } else if (done) {
          base = 'bg-primary/80 text-primary-foreground'
        } else {
          base = 'bg-muted text-muted-foreground'
        }

        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${base}`}
            >
              {step}
            </div>
            {step < total && (
              <div className={`h-px w-8 transition-all duration-300 ${done ? 'bg-primary/80' : 'bg-muted'}`} />
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
  const { recheckSetup } = useAuth()

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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

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
    i18n.changeLanguage('en')
  }, [])

  useEffect(() => {
    axios.get('/auth/setup').then((res) => {
      const env: SetupEnvironment = res.data.environment
      setEnvironment(env)
      setTrack(env.isDeveloper ? 'developer' : 'normal')
    })
  }, [])

  const strength = passwordStrength(password, name, surname, email)
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
      // Stale needsSetup=true from the last poll would otherwise bounce us
      // straight back here via the RootLayout gate — refresh it first.
      await recheckSetup()
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
                <Label htmlFor="setupLanguage">{t('setup.languageLabel')}</Label>
                <LanguageSelect
                  id="setupLanguage"
                  value={language}
                  onValueChange={(lng) => { setLanguage(lng); i18n.changeLanguage(lng) }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setupTimezone">{t('setup.timezoneLabel')}</Label>
                <TimezoneSelect id="setupTimezone" value={timezone} onValueChange={setTimezone} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setupCurrency">{t('setup.currencyLabel')}</Label>
                <CurrencySelect id="setupCurrency" value={currency} onValueChange={setCurrency} />
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('setup.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? t('setup.hidePassword') : t('setup.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className={cn("space-y-1", !password && "invisible")}>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                      style={{ width: `${strength}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">{t('setup.confirmLabel')}</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder={t('setup.confirmPlaceholder')}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showConfirm ? t('setup.hidePassword') : t('setup.showPassword')}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
