/**
 * Seed Registry: configurazione degli schemi di contenuto.
 * Ogni slug (es. 'progetti') mappa a un Seed con la definizione dei campi.
 */
import type { Seed } from './types'

/** Seed di esempio: Progetti (slug: progetti) - Completo con tutti i tipi */
export const PROJECT_SEED: Seed = {
  slug: 'progetti',
  label: 'Progetti',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Titolo', type: 'text' },
    { id: 'br_02', alias: 'description', label: 'Descrizione', type: 'text' },
    { id: 'br_03', alias: 'budget', label: 'Budget', type: 'number' },
    { id: 'br_04', alias: 'progress', label: 'Progresso %', type: 'number' },
    { id: 'br_05', alias: 'active', label: 'Attivo', type: 'boolean' },
    { id: 'br_06', alias: 'published', label: 'Pubblicato', type: 'boolean' },
    { id: 'br_07', alias: 'startDate', label: 'Data Inizio', type: 'date' },
    { id: 'br_08', alias: 'endDate', label: 'Data Fine', type: 'date' },
    { id: 'br_09', alias: 'metadata', label: 'Metadati', type: 'json' },
    { id: 'br_10', alias: 'tags', label: 'Tags', type: 'json' },
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
