// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Loader, Trash2 } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useContentLanguages } from "../hooks/use-content-languages"
import { contentLanguageName } from "../lib/content-languages"
import {
  SettingsActions,
  SettingsFieldError,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-section"

/**
 * The languages the content can be translated into: a list with one language per row, a small form to add one, and
 * a Save of its own (the languages travel in their own request, apart from the rest of the Site settings).
 */
export function ContentLanguagesSection() {
  const { t, i18n } = useTranslation()
  const { isLoading, isPending, state, actions } = useContentLanguages()

  return (
    <SettingsSection
      id="content-languages"
      title={t("settings.contentLanguages.title")}
      description={t("settings.contentLanguages.description")}
    >
      {isLoading ? (
        <div role="status" className="flex items-center justify-center py-12">
          <Loader aria-hidden className="size-6 animate-spin text-muted-foreground" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : (
        <>
          <ul aria-label={t("settings.contentLanguages.listLabel")} aria-describedby="content-languages-kept-hint">
            {state.locales.map((code) => {
              const language = contentLanguageName(code, i18n.language)
              const isDefault = code === state.defaultLocale
              return (
                <li key={code} className="flex items-center justify-between gap-4 border-b border-border py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{language}</span>
                    {/* The code, read as letters, adds nothing to the name beside it. */}
                    <span aria-hidden className="font-mono text-sm text-muted-foreground">{code}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isDefault ? (
                      <Badge>{t("settings.contentLanguages.defaultBadge")}</Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("settings.contentLanguages.makeDefaultAria", { language })}
                        onClick={() => actions.setDefaultLocale(code)}
                      >
                        {t("settings.contentLanguages.makeDefault")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("settings.contentLanguages.removeAria", { language })}
                      disabled={isDefault}
                      onClick={() => actions.remove(code)}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* How many languages there are, said as they are added or removed: the list changes silently otherwise. */}
          <p role="status" className="sr-only">{t("settings.contentLanguages.count", { count: state.locales.length })}</p>

          <p id="content-languages-kept-hint" className="border-b border-border py-3 text-sm text-muted-foreground">
            {t("settings.contentLanguages.keptOnRemoveHint")}
          </p>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              actions.add()
            }}
          >
            <SettingsRow label={t("settings.contentLanguages.addLabel")} htmlFor="content-language-add">
              <div className="flex gap-2">
                <Input
                  id="content-language-add"
                  name="content-language"
                  value={state.draft}
                  placeholder={t("settings.contentLanguages.addPlaceholder")}
                  onChange={(e) => actions.setDraft(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={state.draftError ? true : undefined}
                  aria-describedby={state.draftError ? "content-language-add-error" : undefined}
                />
                <Button type="submit" variant="outline">
                  {t("settings.contentLanguages.add")}
                </Button>
              </div>
              {state.draftError && (
                <SettingsFieldError id="content-language-add-error">
                  {t(`settings.contentLanguages.errors.${state.draftError}`)}
                </SettingsFieldError>
              )}
            </SettingsRow>
          </form>

          <SettingsActions>
            <Button type="button" onClick={actions.save} disabled={!state.isDirty || isPending}>
              {isPending && <Loader aria-hidden className="mr-2 size-4 animate-spin" />}
              {t("settings.contentLanguages.save")}
            </Button>
          </SettingsActions>
        </>
      )}
    </SettingsSection>
  )
}
