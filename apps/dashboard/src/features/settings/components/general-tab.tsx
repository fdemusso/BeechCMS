// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimezoneSelect } from '@/components/ui/timezone-select'
import { CurrencySelect } from '@/components/ui/currency-select'
import { useGeneralTabLogic } from '../hooks/use-general-tab'

export function GeneralTab() {
  const { t } = useTranslation()
  const { isLoading, isPending, state, actions } = useGeneralTabLogic()

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
          <form onSubmit={actions.handleSave} className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">{t('settings.general.siteDefaultsTitle')}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t('settings.general.siteDefaultsDesc')}</p>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="defaultLanguage">{t('settings.general.languageLabel')}</Label>
                  <Select value={state.defaultLanguage} onValueChange={actions.setDefaultLanguage}>
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
                  <TimezoneSelect 
                    value={state.timezone} 
                    onValueChange={actions.setTimezone} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">{t('settings.general.currencyLabel')}</Label>
                  <CurrencySelect 
                    value={state.currency} 
                    onValueChange={actions.setCurrency} 
                  />
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
                    value={state.siteTitle}
                    onChange={(e) => {
                      actions.setSiteTitle(e.target.value)
                      actions.setCompanyName(e.target.value)
                    }}
                    placeholder={t('settings.general.siteTitlePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyAbbreviation">{t('settings.general.companyAbbreviationLabel')}</Label>
                  <Input
                    id="companyAbbreviation"
                    value={state.companyAbbreviation}
                    onChange={(e) => actions.setCompanyAbbreviation(e.target.value)}
                    placeholder={t('settings.general.companyAbbreviationPlaceholder')}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="companyWebsite">{t('settings.general.companyWebsiteLabel')}</Label>
                  <Input
                    id="companyWebsite"
                    type="url"
                    value={state.companyWebsite}
                    onChange={(e) => actions.setCompanyWebsite(e.target.value)}
                    placeholder={t('settings.general.companyWebsitePlaceholder')}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('settings.general.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
