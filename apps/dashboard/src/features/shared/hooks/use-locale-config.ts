// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  isLocalizedBranch,
  resolveLocaleConfig,
  resolveLocalizedFields,
  type LocaleConfig,
  type LocaleSettings,
  type Seed,
} from "@beechcms/core"
import { api } from "@/lib/api"
import { GENERAL_SETTINGS_QUERY_KEY } from "../query-keys"
import { useSchema } from "./use-schema"

/** Same staleness as the settings slice's `useGeneralSettings`, which shares this cache entry. */
const SETTINGS_STALE_MS = 24 * 60 * 60 * 1000

/**
 * The project's content-language config, or `undefined` while no seed has a localized branch — in which
 * case no settings request is made and every resolver below is the identity (mirrors the API).
 */
export function useLocaleConfig(): LocaleConfig | undefined {
  const { data: seeds } = useSchema()
  const hasLocalizedBranch = seeds?.some((seed) => seed.branches.some(isLocalizedBranch)) ?? false
  const { data } = useQuery({
    queryKey: GENERAL_SETTINGS_QUERY_KEY,
    // Same request and payload as the settings slice's fetcher: either observer may fill this entry.
    queryFn: async () => (await api.get<LocaleSettings>("/settings")).data,
    enabled: hasLocalizedBranch,
    staleTime: SETTINGS_STALE_MS,
    select: resolveLocaleConfig,
  })
  return hasLocalizedBranch ? data : undefined
}

/** Resolves an entry's localized branches to the default locale; returns `data` itself when nothing is localized. */
export type LocalizeEntryData = (
  seed: Pick<Seed, "branches"> | null | undefined,
  data: Record<string, unknown>,
) => Record<string, unknown>

/**
 * Dashboard read surfaces show one language: the project default (core fallback chain). The Entry Editor
 * does NOT use this — it needs the stored dictionaries.
 */
export function useLocalizeEntryData(): LocalizeEntryData {
  const config = useLocaleConfig()
  return useCallback(
    (seed, data) => (seed ? resolveLocalizedFields(seed, data, config) : data),
    [config],
  )
}
