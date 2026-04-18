import { slugify, generateEntrySlug } from '@beech/core'

/**
 * Converte stringa in slug URL-safe.
 * Logica spostata in @beech/core per consistenza tra Dashboard e API.
 */
export { slugify }

/**
 * Genera slug da title/name o fallback UUID-like.
 * Logica spostata in @beech/core per consistenza tra Dashboard e API.
 */
export { generateEntrySlug }

