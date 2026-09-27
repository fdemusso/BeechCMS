// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { deserializeFromDb, isLocalizedBranch, resolveLocaleConfig, resolveLocalizedValue } from '@beechcms/core'
import type { Branch, ISiteSettingsRepository, LocaleConfig, Seed } from '@beechcms/core'

type DisplaySeed = Pick<Seed, 'branches' | 'displayNameAlias'>

function localizedDisplayBranch(seed: DisplaySeed): Branch | undefined {
  const branch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
  return branch && isLocalizedBranch(branch) ? branch : undefined
}

/**
 * Loads the project's LocaleConfig for endpoints that show display names of `seeds`, or `undefined` —
 * without reading — when none of them has a localized display-name branch. Uncached for the same reason as
 * `loadLocaleConfig`: an isolate cache invalidated on settings PUT stays stale in every other isolate.
 */
export async function loadDisplayLocaleConfig(
  repository: Pick<ISiteSettingsRepository, 'getAll'>,
  seeds: readonly DisplaySeed[],
): Promise<LocaleConfig | undefined> {
  if (!seeds.some((seed) => localizedDisplayBranch(seed) !== undefined)) return undefined
  return resolveLocaleConfig(await repository.getAll())
}

/**
 * The display name of an entry of `seed`, resolved to the default locale. `value` is the display-name column
 * either as raw storage text (hand-written SELECTs) or already decoded (repository reads): `deserializeFromDb`
 * is a no-op on decoded text / richtext / json values, so one helper serves both.
 * Returns `value` unchanged when `config` is undefined, the display-name branch is not localized, or the resolved
 * translation is not a string (a localized json/richtext display name keeps today's behaviour).
 */
export function resolveDisplayName<T>(seed: DisplaySeed, value: T, config: LocaleConfig | undefined): T | string {
  if (!config) return value
  const branch = localizedDisplayBranch(seed)
  if (!branch) return value
  const resolved = resolveLocalizedValue(branch, deserializeFromDb(branch, value), config.defaultLocale, config)
  return typeof resolved === 'string' ? resolved : value
}
