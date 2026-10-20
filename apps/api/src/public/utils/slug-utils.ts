// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { slugify, generateEntrySlug } from '@beechcms/core'

/**
 * Converts a string into a URL-safe slug.
 * Logic moved to @beechcms/core for consistency between Dashboard and API.
 */
export { slugify }

/**
 * Generates a slug from a title/name or a UUID-like fallback.
 * Logic moved to @beechcms/core for consistency between Dashboard and API.
 */
export { generateEntrySlug }

