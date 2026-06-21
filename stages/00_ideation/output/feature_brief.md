# Feature Brief: TypeScript Codegen CLI (Sprint 3)

## 1. Il Problema
BeechCMS genera dinamicamente schemi D1 e valida i payload a runtime tramite il Botanical Engine. Attualmente manca un bridge verso i client esterni (React, Next.js, client API). Gli sviluppatori frontend devono definire manualmente e mantenere allineate le interfacce TypeScript corrispondenti ai Seed, generando ridondanza, overhead manuale e un alto rischio di disallineamento dei tipi in produzione.

## 2. La Soluzione Proposta
Sviluppare un generatore di tipi statici integrato in `@beechcms/cli`. Il comando leggerà il registro dei Seed (o interrogherà il database D1) e produrrà un file TypeScript contenente le interfacce esportate per ogni tipo di contenuto, garantendo l'autocompletamento lato client.

### Comando CLI
`npx beech generate:types --out src/types/beech.ts`
Flag aggiuntivo: `--local` (per forzare la lettura da `seeds.ts` senza connessione attiva a D1).

## 3. Impatto sul Database (D1)
**Nessun impatto strutturale.** L'operazione è di sola lettura. Il comando non esegue migrazioni né altera le tabelle `content_{slug}` o i trigger FTS5. Se eseguito senza flag `--local`, esegue query di metadata/introspezione su D1 per ricavare lo schema aggiornato.

## 4. Requisiti API e Moduli Core
*   **Pacchetto CLI (`@beechcms/cli`)**: Nuovo comando `generate:types` che gestisce l'I/O (lettura schema, scrittura file out).
*   **Pacchetto Core (`@beechcms/core`)**: Nuovo modulo parser `seed-types-generator.ts`.
*   **Mappatura Tipi (BranchType -> TypeScript)**:
    *   `text` / `richtext` -> `string`
    *   `number` -> `number`
    *   `boolean` -> `boolean`
    *   `date` -> `number` (Unix timestamp)
    *   `relation` -> `string` (ID) o interfaccia correlata

## 5. Output Atteso (Esempio)
Il parser deve generare codice compatibile con questo formato standard, rispettando l'invariante dei campi richiesti/opzionali:

```typescript
// Questo file è generato automaticamente da BeechCMS CLI. Non modificarlo direttamente.

export interface Articolo {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  title?: string;
  body?: string; // Tiptap JSON envelope
  price?: number;
  created_at: number;
  updated_at: number;
}

export interface SeedRegistryTypes {
  articoli: Articolo;
}
