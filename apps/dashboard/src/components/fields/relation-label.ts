// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import { resolveLocalizedValue, type LocaleConfig, type Seed } from "@beechcms/core"
import { useFieldsConfig } from "./context"

/**
 * The raw label of a relation target entry — `data[labelAlias]` — resolved to the default locale when that
 * branch is localized. Callers keep their own string conversion and id/slug fallbacks.
 */
export function relationLabelValue(
  targetSeed: Pick<Seed, "branches"> | undefined,
  data: Record<string, unknown> | undefined,
  labelAlias: string,
  config: LocaleConfig | undefined,
): unknown {
  const raw = data?.[labelAlias]
  const branch = targetSeed?.branches.find((b) => b.alias === labelAlias)
  return branch && config ? resolveLocalizedValue(branch, raw, config.defaultLocale, config) : raw
}

/** `relationLabelValue` bound to `targetSlug`'s seed and the injected locale config. Call before any early return. */
export function useRelationLabel(targetSlug: string | undefined): (data: Record<string, unknown> | undefined, labelAlias: string) => unknown {
  const { useSchema, useLocaleConfig } = useFieldsConfig()
  const { data: seeds } = useSchema()
  const config = useLocaleConfig()
  const targetSeed = seeds?.find((seed) => seed.slug === targetSlug)
  return useCallback(
    (data, labelAlias) => relationLabelValue(targetSeed, data, labelAlias, config),
    [targetSeed, config],
  )
}
