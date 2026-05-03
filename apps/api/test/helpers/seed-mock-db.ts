import { Seed } from '@beechcms/core'
import { vi } from 'vitest'

/**
 * SeedMockDB: Un layer di mock per D1 che opera in memoria e conosce i Seed.
 * Permette di testare i flow CRUD senza dover definire mock manuali per ogni query.
 */
export class SeedMockDB {
  private data: Map<string, any[]> = new Map()
  private seeds: Map<string, Seed>

  constructor(seeds: Seed[]) {
    this.seeds = new Map(seeds.map((s) => [s.slug, s]))
    // Inizializza le tabelle per ogni seed
    seeds.forEach((s) => {
      this.data.set(`content_${s.slug}`, [])
      if (s.allowDrafts) {
        this.data.set(`content_${s.slug}_drafts`, [])
      }
    })
    // Tabelle di sistema
    this.data.set('users', [])
    this.data.set('refresh_tokens', [])
    this.data.set('content_event_log', [])
    this.data.set('analytics', [])
  }

  /** Carica dati iniziali in una tabella */
  load(table: string, records: any[]) {
    this.data.set(table, [...records])
  }

  /** Ottiene tutti i record di una tabella */
  getTable(table: string) {
    return this.data.get(table) || []
  }

  /** Implementazione di D1Database.prepare */
  prepare(sql: string) {
    const self = this
    return {
      bind: (...args: any[]) => {
        return {
          first: async () => self.executeFirst(sql, args),
          all: async () => self.executeAll(sql, args),
          run: async () => self.executeRun(sql, args),
        }
      },
      all: async () => self.executeAll(sql, []),
      first: async () => self.executeFirst(sql, []),
      run: async () => self.executeRun(sql, []),
    }
  }

  // --- Implementazione semplificata della logica SQL ---

  private executeFirst(sql: string, args: any[]) {
    const results = this.query(sql, args)
    return results[0] || null
  }

  private executeAll(sql: string, args: any[]) {
    const results = this.query(sql, args)
    return { results, success: true, meta: { changes: 0 } }
  }

  private executeRun(sql: string, args: any[]) {
    const normalizedSql = sql.toLowerCase().trim()
    
    if (normalizedSql.startsWith('insert into')) {
      const match = sql.match(/insert into\s+([^\s(]+)/i)
      const table = match?.[1]
      if (table && this.data.has(table)) {
        // Logica semplificata: estraiamo i valori dai bindings
        // In una INSERT Beech, i primi campi sono spesso id, slug, status...
        // Per ora facciamo un mock grezzo che salva l'oggetto
        const tableData = this.data.get(table)!
        // Nota: questa è una semplificazione estrema. 
        // In un test reale potremmo voler mappare args -> colonne usando il Seed.
        tableData.push({ _raw: args }) 
      }
    }
    
    if (normalizedSql.startsWith('delete from')) {
       // ... logica delete
    }

    return { success: true, meta: { changes: 1 } }
  }

  private query(sql: string, args: any[]): any[] {
    const normalizedSql = sql.toLowerCase().trim()

    // Identifica la tabella
    const tableMatch = sql.match(/from\s+([^\s]+)/i)
    const table = tableMatch?.[1]

    if (!table || !this.data.has(table)) {
      return []
    }

    let results = [...this.data.get(table)!]

    // Filtro basilare per slug o id (comune nelle query Beech)
    if (normalizedSql.includes('where slug = ?')) {
      const slugValue = args[0]
      results = results.filter(r => r.slug === slugValue)
    } else if (normalizedSql.includes('where id = ?')) {
      const idValue = args[0]
      results = results.filter(r => r.id === idValue)
    }

    return results
  }
}

/** Crea un'istanza mock di D1Database compatibile con Cloudflare Workers */
export function createMockD1(db: SeedMockDB): any {
  return {
    prepare: (sql: string) => db.prepare(sql),
    // ... altri metodi se necessari
  }
}
