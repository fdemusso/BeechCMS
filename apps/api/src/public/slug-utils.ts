import { slugify, generateEntrySlug } from '@beechcms/core'

/**
 * Converte stringa in slug URL-safe.
 * Logica spostata in @beechcms/core per consistenza tra Dashboard e API.
 */
export { slugify }

/**
 * Genera slug da title/name o fallback UUID-like.
 * Logica spostata in @beechcms/core per consistenza tra Dashboard e API.
 */
export { generateEntrySlug }

