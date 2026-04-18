/**
 * Utility per la gestione degli slug.
 * Condivisa tra Dashboard e API pubbliche.
 */

/**
 * Converte una stringa in uno slug URL-safe.
 * Limita la lunghezza a 15 caratteri come richiesto.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')               // Normalizza caratteri accentati
    .replace(/[^\w\s-]/g, '')        // Rimuove tutto ciò che non è alfanumerico (accetta underscore temporaneamente)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')        // Sostituisce spazi, underscore e trattini multipli con singolo trattino
    .replace(/^-+|-+$/g, '')         // Rimuove trattini all'inizio o alla fine
    .slice(0, 15)                    // Limita a 15 caratteri
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
