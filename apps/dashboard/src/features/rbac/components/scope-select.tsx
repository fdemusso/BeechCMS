// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { GLOBAL_SCOPE, type Scope } from "@beechcms/core"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePermissions, useSchema } from "@/features/shared"

/**
 * Scope picker for assignments and invitations.
 *
 * Options come from `usePermissions().manageableScopes` — the server's own answer to
 * "what may this caller grant on". NOT from `useSchema()`: `GET /api/schema` is filtered
 * by `content:read`, which a `manage_users` holder need not have on the seeds they
 * administer. Labels are enriched from `useSchema()` when the seed happens to be
 * visible, and fall back to the raw slug otherwise.
 */
export interface ScopeSelectProps {
  value: Scope | undefined
  onValueChange: (value: Scope) => void
  id?: string
}

export function ScopeSelect({ value, onValueChange, id }: ScopeSelectProps) {
  const { t } = useTranslation()
  const { manageableScopes } = usePermissions()
  const { data: seeds = [] } = useSchema()

  if (manageableScopes.length === 0) {
    return (
      <div>
        <Select disabled>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={t("rbac.scope.none", "No scopes available")} />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <p className="text-xs text-muted-foreground mt-1">{t("rbac.scope.none", "No scopes available")}</p>
      </div>
    )
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t("rbac.scope.select", "Select a scope")} />
      </SelectTrigger>
      <SelectContent position="popper">
        {manageableScopes.map((scope) => {
          if (scope === GLOBAL_SCOPE) {
            return (
              <SelectItem key={scope} value={scope}>
                {t("rbac.scope.global", "All seeds (global)")}
              </SelectItem>
            )
          }
          const seed = seeds.find((s) => s.slug === scope)
          return (
            <SelectItem key={scope} value={scope}>
              {seed?.labelPlural ?? seed?.label ?? scope}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
