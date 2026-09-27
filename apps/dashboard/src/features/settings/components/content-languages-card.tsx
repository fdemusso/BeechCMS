// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Loader, Trash2 } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useContentLanguages } from "../hooks/use-content-languages"
import { contentLanguageName } from "../lib/content-languages"

export function ContentLanguagesCard() {
  const { t, i18n } = useTranslation()
  const { isLoading, isPending, state, actions } = useContentLanguages()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.contentLanguages.title")}</CardTitle>
        <CardDescription>{t("settings.contentLanguages.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {state.locales.map((code) => (
            <div key={code} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{contentLanguageName(code, i18n.language)}</span>
                <span className="font-mono text-xs text-muted-foreground">{code}</span>
              </div>
              <div className="flex items-center gap-2">
                {code === state.defaultLocale ? (
                  <Badge>{t("settings.contentLanguages.defaultBadge")}</Badge>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => actions.setDefaultLocale(code)}>
                    {t("settings.contentLanguages.makeDefault")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("settings.contentLanguages.remove", { code })}
                  disabled={code === state.defaultLocale}
                  onClick={() => actions.remove(code)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="content-language-add">{t("settings.contentLanguages.addLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="content-language-add"
              value={state.draft}
              placeholder={t("settings.contentLanguages.addPlaceholder")}
              onChange={(e) => actions.setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  actions.add()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={actions.add}>
              {t("settings.contentLanguages.add")}
            </Button>
          </div>
          {state.draftError && (
            <p role="alert" className="text-xs text-destructive">
              {t(`settings.contentLanguages.errors.${state.draftError}`)}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t("settings.contentLanguages.keptOnRemoveHint")}</p>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={actions.save} disabled={!state.isDirty || isPending}>
          {isPending && <Loader className="mr-2 size-4 animate-spin" />}
          {t("settings.contentLanguages.save")}
        </Button>
      </CardFooter>
    </Card>
  )
}
