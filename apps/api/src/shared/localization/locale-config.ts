// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isLocalizedBranch, resolveLocaleConfig } from '@beechcms/core'
import type { ISiteSettingsRepository, LocaleConfig, Seed } from '@beechcms/core'

/**
 * Loads the project's LocaleConfig for a write on `seed`, or `undefined` when the seed has no localized
 * branch — the only case where the config changes validation — so non-localized seeds pay no D1 read.
 * Deliberately uncached: an isolate cache invalidated on settings PUT would stay stale in every other
 * isolate, and writes can afford one small read.
 */
export async function loadLocaleConfig(
  repository: Pick<ISiteSettingsRepository, 'getAll'>,
  seed: Pick<Seed, 'branches'>,
): Promise<LocaleConfig | undefined> {
  if (!seed.branches.some(isLocalizedBranch)) return undefined
  return resolveLocaleConfig(await repository.getAll())
}
