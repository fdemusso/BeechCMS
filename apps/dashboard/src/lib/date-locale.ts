// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { de, enUS, es, fr, it, type Locale } from "date-fns/locale"

/** The date-fns locale of each dashboard language: the one place a new language has to be added for dates. */
const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, it, es, de, fr }

/** The date-fns locale for an i18next language tag; a regional tag (`de-AT`) uses its base language, an unknown one English. */
export function dateFnsLocaleFor(language: string | undefined): Locale {
  return DATE_FNS_LOCALES[(language ?? "en").split("-")[0]] ?? enUS
}
