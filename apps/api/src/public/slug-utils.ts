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

