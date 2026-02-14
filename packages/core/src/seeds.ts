/**
 * Seed Registry: configurazione degli schemi di contenuto.
 * Ogni slug (es. 'progetti') mappa a un Seed con la definizione dei campi.
 */
import type { Seed } from './types'

/** Seed di esempio: Progetti (slug: progetti) */
export const PROJECT_SEED: Seed = {
  slug: 'progetti',
  label: 'Progetti',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Titolo', type: 'text' },
    { id: 'br_02', alias: 'budget', label: 'Budget', type: 'number' },
  ],
}

/** Registro: slug -> Seed */
export const SEED_REGISTRY: Record<string, Seed> = {
  progetti: PROJECT_SEED,
}

/**
 * Restituisce il Seed per lo slug dato, o null se non esiste.
 */
export function getSeed(slug: string): Seed | null {
  return SEED_REGISTRY[slug] ?? null
}
