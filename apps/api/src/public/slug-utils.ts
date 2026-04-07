/**
 * Converte stringa in slug URL-safe.
 * TODO: Allineare la regex con slugFromText (Dashboard) e spostare la logica 
 * in @beech/core per garantire consistenza assoluta tra dashboard e API pubbliche.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Genera slug da title/name o fallback UUID-like.
 */
export function generateEntrySlug(input: { slug?: string; title?: unknown; name?: unknown }): string {
  const candidate =
    (typeof input.slug === 'string' && input.slug) ||
    (typeof input.title === 'string' && input.title) ||
    (typeof input.name === 'string' && input.name) ||
    crypto.randomUUID().slice(0, 8)

  const normalized = slugify(candidate)
  return normalized || crypto.randomUUID().slice(0, 8)
}

