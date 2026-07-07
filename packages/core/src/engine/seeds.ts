// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Seed Registry: configurazione degli schemi di contenuto.
 * In v0.4.0 ogni Seed genera una tabella `content_{slug}` con colonne reali.
 * `branch.alias` è il nome della colonna SQL.
 */
import type { Seed } from './types.js'

/**
 * Registro globale dei Seed. 
 * In produzione, questo viene popolato dalle definizioni dell'utente.
 */
export const SEED_REGISTRY: Record<string, Seed> = {}

/**
 * Registra un set di Seed nel registro globale.
 */
export function registerSeeds(seeds: Seed[]) {
  seeds.forEach(seed => {
    SEED_REGISTRY[seed.slug] = seed
  })
}

/** 
 * Ritorna il Seed per lo slug dato, o null se non esiste. 
 */
export function getSeed(slug: string): Seed | null {
  return SEED_REGISTRY[slug] ?? null
}
