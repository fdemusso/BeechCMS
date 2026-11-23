// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Utility per la gestione degli slug.
 * Condivisa tra Dashboard e API pubbliche.
 */

/**
 * Longest slug `slugify` emits. Names that share a brand-and-model prefix (a tyre or product
 * catalog) stay distinct well past the old 15-character cut, while URLs stay short.
 */
export const MAX_SLUG_LENGTH = 80

/**
 * Converte una stringa in uno slug URL-safe.
 * Limita la lunghezza a `MAX_SLUG_LENGTH` caratteri.
 * Never emits `_`, so a live slug can never carry `TRASHED_SLUG_INFIX`.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')               // Normalizza caratteri accentati
    .replace(/[^\w\s-]/g, '')        // Rimuove tutto ciò che non è alfanumerico
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')        // Sostituisce spazi e underscore con trattino
    .replace(/^-+|-+$/g, '')         // Rimuove trattini all'inizio o alla fine
    .slice(0, MAX_SLUG_LENGTH)       // Limita la lunghezza
    .replace(/-+$/g, '')             // Rimuove trattini rimasti alla fine dopo il taglio
}

/** Separator between an entry's slug and its deletion timestamp while it sits in the Trash. */
export const TRASHED_SLUG_INFIX = '_old_'

const TRASHED_SLUG_SUFFIX = new RegExp(`${TRASHED_SLUG_INFIX}\\d+$`)

/** `<slug>_old_<deletedAtMs>`, lower-cased. Frees the slug for reuse under any UNIQUE constraint. */
export function toTrashedSlug(slug: string, deletedAtMs: number): string {
  return `${slug.toLowerCase()}${TRASHED_SLUG_INFIX}${deletedAtMs}`
}

/** Inverse of toTrashedSlug: strips a trailing `_old_<digits>`; returns the input unchanged when absent. */
export function fromTrashedSlug(slug: string): string {
  return slug.replace(TRASHED_SLUG_SUFFIX, '')
}

/**
 * Genera uno slug da un input (es. titolo o nome) o un fallback UUID.
 */
export function generateEntrySlug(input: { slug?: string; title?: unknown; name?: unknown }): string {
  const candidate =
    (typeof input.slug === 'string' && input.slug) ||
    (typeof input.title === 'string' && input.title) ||
    (typeof input.name === 'string' && input.name) ||
    Math.random().toString(36).slice(2, 10) // Fallback compatto se crypto non disponibile (o slice 8)

  const normalized = slugify(candidate)
  return normalized || Math.random().toString(36).slice(2, 10)
}
