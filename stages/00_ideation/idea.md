# Proposta di Ideazione: Generatore Automatico di Tipi TypeScript (`beech gen-types`)

---

## 1. Visione di Prodotto e Valore Fondamentale

### Il Problema
Nei moderni flussi di sviluppo Headless CMS, esiste una frattura cronica tra la definizione dei modelli di contenuto nel CMS e il codice applicativo dei frontend (Next.js, Astro, Remix, Vue, Svelte, script di automazione).
Oggi, gli sviluppatori frontend sono costretti a:
- Riscrivere e mantenere a mano le interfacce TypeScript corrispondenti a ciascun contenuto (es. `interface ProjectContent { ... }`).
- Subire il cosiddetto **Schema Drift**: quando lo schema attivo nel database viene modificato (un campo viene aggiunto, rinominato, reso obbligatorio o trasformato in array), il frontend non riceve alcun avviso a tempo di compilazione e gli errori emergono solo a runtime o in produzione.
- Dipendere da file sorgente di backend (come `seeds.ts`), cosa problematica quando il frontend vive in un repository disaccoppiato o quando si lavora contro ambienti remoti.

### La Visione
Fornire un'esperienza **"Zero-Drift End-to-End Type Safety"** nativa per BeechCMS, esponendo un comando CLI ufficiale (`beech gen-types` / `beech generate:types`) che legga lo stato autoritativo e attivo dal **Database (D1 locale o remoto)** ed emetta automaticamente definizioni TypeScript pure, fortemente tipizzate e pronte all'uso.

---

## 2. Il Database come Unica Fonte di Verità (Modello Supabase CLI)

Nel modello architetturale di BeechCMS, una volta caricati gli schemi nel sistema, **il Database è l'unica autorità canonica dello schema attivo** (tabella di sistema `seeds`). 

Si esclude qualsiasi lettura o dipendenza da file statici come `seeds.ts`: la generazione dei tipi riflette esclusivamente lo schema effettivamente presente nel database.

### Benchmark Diretto con Supabase CLI
Lo strumento segue rigorosamente il paradigma di `supabase gen types typescript`:

* **In Supabase**:
  - `supabase gen types typescript --local` interroga il database locale attivo.
  - `supabase gen types typescript --linked` (o `--project-id`) interroga il database remoto sul cloud.
* **In BeechCMS (`beech gen-types`)**:
  - **Locale (`npx beech gen-types`)**: Interroga direttamente l'istanza D1 locale attiva (SQLite locale / Wrangler state).
  - **Online/Remoto (`npx beech gen-types --remote`)**: Interroga direttamente l'ambiente Cloudflare D1 remoto (Staging o Produzione).

### Vantaggi di questo approccio
1. **Verità Reale (WYSIWYG dello Schema)**: I tipi generati non riflettono ciò che è "scritto nel codice sorgente", ma ciò che è **effettivamente presente e attivo nel database**.
2. **Supporto Totale a Frontend Disaccoppiati**: Un'applicazione frontend (anche in un repository Git separato) non ha bisogno di accedere al codice sorgente del CMS: basta puntare al database locale o remoto per generare all'istante l'intero contratto di tipi.
3. **Puro TypeScript, Zero Dipendenze Runtime**: Il file generato è un semplice modulo TypeScript (`.d.ts` o `.ts`) privo di qualsiasi dipendenza runtime esterna.

---

## 3. Cosa Deve Fare la Feature (Aspetti Funzionali e Comportamentali)

### A. Introspezione dello Schema dal Database
Il comando si connette al database D1 (locale o remoto) ed estrae le definizioni dei Seed attivi registrati, trasformandole nelle rispettive strutture TypeScript:

1. **Tipi di Campo Completi**:
   - Primitivi (testo, numeri, booleani, timestamp numerici, JSON generico `unknown`).
   - Testi arricchiti (Rich Text / HTML / Markdown).
   - Collezioni e liste (array di stringhe, gallerie di file, array di media).
2. **Union Types da Scelte Chiuse**:
   - Se un campo nel database definisce opzioni predefinite (es. categorie `'restauro' | 'costruzione'`, stati personalizzati), il tipo generato deve essere una *String Literal Union* precisa e non una generica `string`.
3. **Gestione di Obbligatorietà e Nullabilità**:
   - I campi con vincolo di obbligatorietà nello schema generano proprietà non opzionali.
   - I campi facoltativi includono il modificatore `?`.
4. **Strutture Annidate (Repeater)**:
   - I campi ripetitori/composti vengono ricorsivamente tipizzati come array di oggetti (`Array<{ ... }>`) con tutti i rispettivi sotto-campi.
5. **Relazioni tra Contenuti**:
   - Relazioni 1-a-1 mappate come ID (`string`).
   - Relazioni 1-a-molti (junctions) mappate come array di ID (`string[]`).
6. **Campi di Sistema Standardizzati**:
   - Ogni interfaccia di contenuto include i campi strutturali garantiti dal CMS (`id`, `slug`, `status` con union degli stati ammessi, timestamp `created_at` e `updated_at`).

### B. Registro Unificato del Database (`BeechDatabase` / `SeedRegistryTypes`)
Oltre alle singole interfacce per ogni collezione, il comando genera un'interfaccia di registro centrale che mappa ogni tabella/collezione al proprio tipo. Questo abilita:
- Autocompletamento per client API generici (es. `client.from('projects').getOne(...)`).
- Tipizzazione forte end-to-end senza dover importare manualmente decine di singole interfacce.

### C. Flessibilità e Controllo CLI
- **Percorso di output personalizzabile**: Supporto a flag intuitivi (`--output`, `--out`, `-o`) con fallback convenzionale (default `src/types/beech.d.ts` o `src/types/beech.ts`).
- **Nomi e alias naturali**: Supporto a `beech gen-types`, `beech generate:types`, `beech gen types`.
- **Targeting dell'ambiente**:
  - Default: Database locale D1.
  - `--remote`: Database remoto Cloudflare D1.
  - `--db <nome>`: Possibilità di specificare/sovrascrivere il nome del database D1 target.
- **Determinismo**: Ordinamento stabile (alfabetico per slug) per garantire diff puliti e zero modifiche casuali nei commit Git.

---

## 4. Flussi di Utilizzo e Scenari Utente (Developer Journey)

### Scenario 1: Sviluppo Frontend con Database Locale (Stile Supabase Local)
1. Lo sviluppatore avvia l'ambiente locale del CMS (`beech dev` o `beech onboard`).
2. Nel frontend esegue:
   ```bash
   npx beech gen-types
   ```
3. La CLI interroga il database D1 locale e compila istantaneamente i tipi nel frontend in `src/types/beech.d.ts`.
4. Nel codice React/Vue/Astro:
   ```typescript
   import type { BeechDatabase, Projects } from '@/types/beech'
   ```
5. L'IDE offre autocompletamento completo su tutti i campi del database locale.

### Scenario 2: Frontend Standalone che punta all'Ambiente Remoto / Produzione
1. Uno sviluppatore frontend sta lavorando su un'app mobile o un frontend Astro separato senza il codice sorgente del CMS.
2. Esegue:
   ```bash
   npx beech gen-types --remote
   ```
3. La CLI si connette al database Cloudflare D1 remoto ed estrae lo schema di produzione aggiornato.

### Scenario 3: Pre-build Check e CI/CD Pipeline
1. Nel `package.json` dell'applicazione frontend:
   ```json
   "scripts": {
     "codegen": "beech gen-types --remote",
     "build": "beech gen-types --remote && next build"
   }
   ```
2. Durante la pipeline di CI/CD, i tipi vengono scaricati dal database remoto; se il codice frontend fa riferimento a colonne rimosse o modificate, il build fallisce a tempo di compilazione TypeScript prima del deploy.

---

## 5. Confini di Dominio e Principi di Esclusione (YAGNI)

Per mantenere la massima purezza concettuale ed ergonomica:

1. **Esclusione Totale di `seed.ts`**: La CLI non cerca, non interpreta e non legge file `.ts`/`.js` di schema locali. L'unica fonte è il database (D1).
2. **Nessun SDK o Client Runtime generato**: Il comando genera esclusivamente contratti di tipo statici (`.d.ts` / `.ts`), non client HTTP o query builder a runtime.
3. **Operazione Rigorosamente Read-Only**: La generazione interroga solo lo schema di sistema del database; non esegue scritture, modifiche o migrazioni.
4. **Nessuna dipendenza da runtime esterni**: Il file di tipi emesso è puro TypeScript standard, privo di import verso pacchetti esterni.
