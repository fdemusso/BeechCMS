// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_RETENTION_DAYS } from '@beechcms/core'
import { Loader as Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSelect } from '@/components/ui/language-select'
import { TimezoneSelect } from '@/components/ui/timezone-select'
import { CurrencySelect } from '@/components/ui/currency-select'
import { useGeneralTabLogic } from '../hooks/use-general-tab'
import { ContentLanguagesSection } from './content-languages-section'
import { SettingsActions, SettingsFieldError, SettingsRow, SettingsSection } from '@/components/ui/settings-section'
import { rowDescriptionDomId } from '@/components/ui/settings-section-ids'

/**
 * Site: who owns it, its regional defaults, how long the Trash keeps things, and the languages its content comes in.
 *
 * The first three sections are one form with one Save, because the API takes them in one request; the languages
 * are a form of their own further down, saved on their own. The form turns the browser's own validation off
 * (`noValidate`) because the page words the refusal itself, next to the field, and moves the focus to it.
 */
export function SiteTab() {
  const { t } = useTranslation()
  const { isLoading, isPending, errors, refusals, state, actions } = useGeneralTabLogic()
  const websiteRef = useRef<HTMLInputElement>(null)
  const retentionRef = useRef<HTMLInputElement>(null)

  // After every refused save the focus goes to the first field that was refused.
  useEffect(() => {
    if (refusals === 0) return
    if (errors.companyWebsite) websiteRef.current?.focus()
    else if (errors.trashRetentionDays) retentionRef.current?.focus()
    // `errors` is read at the moment of the refusal; only a new refusal moves the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusals])

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center py-12">
        <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <form noValidate onSubmit={actions.handleSave} aria-busy={isPending}>
        <div className="space-y-10">
          <SettingsSection
            id="identity"
            title={t('settings.general.companyInfoTitle')}
            description={t('settings.general.companyInfoDesc')}
          >
            <SettingsRow label={t('settings.general.siteTitleLabel')} htmlFor="site-title">
              <Input
                id="site-title"
                name="organization"
                autoComplete="organization"
                value={state.siteTitle}
                onChange={(e) => {
                  actions.setSiteTitle(e.target.value)
                  actions.setCompanyName(e.target.value)
                }}
                placeholder={t('settings.general.siteTitlePlaceholder')}
              />
            </SettingsRow>

            <SettingsRow label={t('settings.general.companyAbbreviationLabel')} htmlFor="site-abbreviation">
              <Input
                id="site-abbreviation"
                name="abbreviation"
                autoComplete="off"
                value={state.companyAbbreviation}
                onChange={(e) => actions.setCompanyAbbreviation(e.target.value)}
                placeholder={t('settings.general.companyAbbreviationPlaceholder')}
              />
            </SettingsRow>

            <SettingsRow label={t('settings.general.companyWebsiteLabel')} htmlFor="site-website">
              <Input
                ref={websiteRef}
                id="site-website"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={state.companyWebsite}
                onChange={(e) => actions.setCompanyWebsite(e.target.value)}
                placeholder={t('settings.general.companyWebsitePlaceholder')}
                aria-invalid={errors.companyWebsite ? true : undefined}
                aria-describedby={errors.companyWebsite ? 'site-website-error' : undefined}
              />
              {errors.companyWebsite && <SettingsFieldError id="site-website-error">{errors.companyWebsite}</SettingsFieldError>}
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            id="regional"
            title={t('settings.general.siteDefaultsTitle')}
            description={t('settings.general.siteDefaultsDesc')}
          >
            <SettingsRow label={t('settings.general.languageLabel')} htmlFor="site-language">
              <LanguageSelect id="site-language" value={state.defaultLanguage} onValueChange={actions.setDefaultLanguage} />
            </SettingsRow>

            <SettingsRow label={t('settings.general.timezoneLabel')} htmlFor="site-timezone">
              <TimezoneSelect id="site-timezone" value={state.timezone} onValueChange={actions.setTimezone} />
            </SettingsRow>

            <SettingsRow label={t('settings.general.currencyLabel')} htmlFor="site-currency">
              <CurrencySelect id="site-currency" value={state.currency} onValueChange={actions.setCurrency} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            id="trash"
            title={t('settings.general.trashTitle')}
            description={t('settings.general.trashDesc')}
          >
            <SettingsRow
              label={t('settings.general.trashRetentionLabel')}
              htmlFor="site-trash-retention"
              description={t('settings.general.trashRetentionHint')}
            >
              <Input
                ref={retentionRef}
                id="site-trash-retention"
                name="trash-retention-days"
                type="number"
                min={0}
                max={MAX_RETENTION_DAYS}
                step={1}
                inputMode="numeric"
                autoComplete="off"
                value={state.trashRetentionDays}
                onChange={(e) => actions.setTrashRetentionDays(e.target.value)}
                aria-invalid={errors.trashRetentionDays ? true : undefined}
                aria-describedby={[
                  rowDescriptionDomId('site-trash-retention'),
                  errors.trashRetentionDays ? 'site-trash-retention-error' : null,
                ].filter(Boolean).join(' ')}
              />
              {errors.trashRetentionDays && (
                <SettingsFieldError id="site-trash-retention-error">{errors.trashRetentionDays}</SettingsFieldError>
              )}
            </SettingsRow>
          </SettingsSection>
        </div>

        <SettingsActions>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {t('settings.general.saveChanges')}
          </Button>
        </SettingsActions>
      </form>

      <ContentLanguagesSection />
    </div>
  )
}
