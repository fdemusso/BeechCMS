## ── Sprint 3: TypeScript Codegen CLI ──

### Problema
Beech genera schemi D1 dinamicamente e valida i payloads a runtime. Tuttavia, gli sviluppatori che creano frontend (React, Next.js, Vue) o client API devono definire manualmente le interfacce TypeScript corrispondenti ai loro Seed per avere l'autocompletamento, creando ridondanza e rischio di disallineamento.

### Soluzione proposta
Aggiungere alla CLI `@beechcms/cli` un comando di codegen che legga i Seed registrati nel file `seeds.ts` locale o collegandosi al database D1 ed esporti un file di tipi statici TypeScript.

#### Esempio di utilizzo:
```bash
npx beech generate:types --out src/types/beech.ts
```

#### Esempio di output generato (`beech.ts`):
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

export interface Prodotto {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  name: string;
  description?: string;
  price: number;
  stock: number;
  rating?: number;
  created_at: number;
  updated_at: number;
}

export interface SeedRegistryTypes {
  articoli: Articolo;
  prodotti: Prodotto;
}
```

### Checklist di Implementazione (Sprint 3)
- [ ] Creare il comando `generate:types` all'interno del pacchetto `@beechcms/cli`.
- [ ] Implementare un parser in core `packages/core/src/seed-types-generator.ts` che mappa i tipi di `BranchType` ai tipi primitivi TypeScript:
  - `text` / `richtext` -> `string`
  - `number` -> `number`
  - `boolean` -> `boolean`
  - `date` -> `number` (timestamp unix)
  - `relation` -> `string` (ID correlato) o l'interfaccia correlata.
- [ ] Supportare il flag opzionale `--local` per leggere gli schemi direttamente da `seeds.ts` senza connettersi a D1.
- [ ] Scrivere test per verificare che i tipi generati riflettano correttamente i campi richiesti (required/nullable) e i tipi corretti.
