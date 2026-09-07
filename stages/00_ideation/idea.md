# Idea Draft: Revamp Documentazione BeechCMS (Ispirazione Supabase UX & Stile)

## 1. Contesto e Obiettivo

L'attuale documentazione di BeechCMS (in `docs/`, basata su VitePress) possiede una solida base tecnica ma risente di una navigazione piatta a sidebar singola, una homepage generica e file monolitici (come `api-reference.md` di oltre 2.000 righe).

L'obiettivo è riorganizzare l'intera esperienza documentale prendendo diretta ispirazione dai pattern di eccellenza di **Supabase Docs** (struttura a sezioni con mega-menu in navbar, multi-sidebar contestuale, Bento Grid in home, framework cards con AI quickstart prompts, layout reference modulare), declinandola fedelmente sull'**identità visiva e il brand BeechCMS** e sul suo stack edge-native su Cloudflare, adottando un approccio **Vertical Slice anche nella documentazione** per garantire massima manutenibilità e zero complessità spuria.

---

## 2. Architettura dell'Informazione (Ispirata a Supabase & VSA)

### A. Top Navigation Bar (Header con Dropdown) & Multi-Sidebar Contestuale
La barra di navigazione superiore organizza i contenuti in 6 macro-aree verticali. Cliccando su ciascuna voce, la sidebar laterale si riconfigura automaticamente mostrando solo l'albero di navigazione della sezione attiva:

1. **Start (`/start/`)**:
   - Panoramica & Concetti Base (Edge-native, Headless, Stack Cloudflare Workers/D1/R2).
   - Quickstart "First Project" in 5 minuti.
   - **Connect a Framework**: Guide di integrazione rapida per i framework web moderni su Cloudflare (Astro, Next.js, Remix/React Router v7, Hono, SvelteKit, Nuxt), ciascuna con il blocco copiale "AI Quickstart Prompt" in cima alla guida.
2. **Funzionalità (`/features/`)**:
   - Approfondimento per ciascuna slice del Botanical Engine:
     - **Botanical Schema Compiler** (Seeds, Branches, Fruits, Physical tables D1).
     - **Edge Content API** (Hono router, latenza sub-millisecondo, Problem Details RFC 7807).
     - **Direct-to-R2 Media** (Upload presigned URLs, streaming senza saturazione della memoria worker).
     - **Application-Level Encryption (ALE)** (Cifratura AES-256-GCM, blind indexing HMAC per ricerca esatta).
     - **Dual-Table Mirror Staging** (Isolamento bozze, staging tables vs production tables).
     - **Automations & Webhooks** (Pipeline asincrone con Upstash QStash e notifiche Resend).
3. **Build (`/build/`)**:
   - Costruzione del backend e configurazione del progetto:
     - Creazione e modellazione di nuovi Seeds & Branches.
     - Sviluppo di Custom Widgets con `@beechcms/widget-sdk`.
     - Regole di validazione e layout personalizzati del Form Editor.
     - Definizione di Security Policies sui campi (`confidential`, `restricted`, `private`, `public`).
     - Sviluppo locale: CLI unificata (`pnpm beech`), stack Docker, migrazioni D1 locali.
4. **Manage (`/manage/`)**:
   - Utilizzo della Dashboard e gestione operativa:
     - Content Editor e Layout Builder visivo.
     - CodeMirror JSON Editor (modalità d'uso nel pannello admin).
     - Media Manager & Asset Library.
     - Autenticazione: Utenti, Ruoli e Gestione Token JWT (in-memory access token 15-min + refresh HTTP-only).
     - Hardening & Rate Limiting (Token Bucket a refill continuo, protezione dual-key IP + Account).
     - Osservabilità, metriche e audit log.
5. **Reference (`/reference/`)**:
   - Contratti tecnici e specifiche formali (struttura modulare scorporata dal monolite):
     - **REST API Reference**: Scomposta per slice di dominio (`api/auth.md`, `api/records.md`, `api/media.md`, `api/automations.md`, ecc.).
     - **Client SDK (`@beechcms/client`)**: Metodi, opzioni, filtri, caching edge.
     - **Forms SDK (`@beechcms/forms-react`)**: Componenti React, hooks, validazione.
     - **Search Client (`@beechcms/search-client`)**: Hook `useBeechSearch`, vector similarity, cache locale.
     - **CLI Reference (`@beechcms/cli`)**: Comandi, flags, codici di uscita.
6. **Resources (`/resources/`)**:
   - Architettura Interna (Vertical Slice Architecture, Invariant Rules, Graphify CLI).
   - Guida al Deploy su Cloudflare (Workers, Pages, D1, R2, variabili e secret).
   - Template starter & progetti d'esempio.
   - **Glossario di Dominio**: Spiegazione dettagliata dei concetti e termini del Botanical Engine.
   - **Changelog**: Collegamento diretto e ufficiale ai Release Notes di GitHub (nessuna duplicazione manuale).
7. **Search Bar (`Ctrl+K`)**:
   - Motore di ricerca locale integrato di VitePress (`provider: 'local'`) indicizzato in build-time, veloce e senza dipendenze SaaS esterne.

---

## 3. Struttura della Homepage (`docs/index.md`) — Bento Grid

La nuova landing page replica il layout visuale modulare di Supabase ma declinato su BeechCMS:

1. **Hero Section**:
   - Titolo distintivo con gradiente BeechCMS (`#212121` -> `#3F3D56` -> `#FF6584` -> `#DEA684`).
   - Tagline tipografica Lora/Geist: *"Ultra-fast, schema-driven content engine engineered for Cloudflare Workers, D1, and R2."*
   - CTA primarie: *"Start Quickstart (5 min)"* e *"Esplora la Reference"*.
2. **Cluster "Connect a Framework"**:
   - Griglia di card con loghi per connettere BeechCMS ai frontend moderni su Cloudflare (Astro, Next.js, Remix, Hono, SvelteKit, Nuxt). Deep link diretto alla rispettiva guida quickstart.
3. **Cluster "Core Pillars / Vertical Slices"**:
   - Card interattive che guidano lo sviluppatore nelle slice portanti del motore (Botanical Schema, Edge API, R2 Media, Cifratura ALE, Dual-Table Staging, Automations).
4. **Cluster "Official SDKs"**:
   - Panoramica dei pacchetti client ufficiali (`@beechcms/client`, `@beechcms/forms-react`, `@beechcms/search-client`, `@beechcms/cli`).
5. **Cluster "Cloudflare Native Architecture"**:
   - Mappa visuale dell'infrastruttura edge: Workers, D1 SQLite, R2 Storage, zero cold-starts e costi minimi.

---

## 4. Esperienza del Codice e Componenti Atomici

- **100% Statico, Zero Runtime Pesanti**:
  - Nessun editor scrivibile o CodeMirror integrato nei docs: massimo punteggio prestazionale e purezza SSG.
- **Blocco "AI Quickstart Prompt" (`<AiPromptBlock />`)**:
  - Box dedicato all'inizio delle guide framework con prompt di istruzioni per LLM (Cursor, Claude, ChatGPT), passi di scaffolding e link alla doc, con pulsante di copia rapida.
- **Blocchi di Codice Avanzati**:
  - Barra superiore con percorso file (es. `src/lib/beech.ts`) e badge linguaggio.
  - Numerazione righe ed evidenziazione con glow Beech (`#FF6584` / `#DEA684`).
  - Commutatore a schede dei package manager (`pnpm` | `npm` | `bun` | `yarn`) con sincronizzazione persistente nel browser via `localStorage`.
  - Commutatore per chiamate API (`TypeScript SDK` | `cURL` | `Fetch`).
  - Pulsante di copia con feedback visivo.

---

## 5. Design System & Identità Visiva (Palette BeechCMS Rigorosa)

- **Base Black**: `#212121`
- **Deep Base (Plum / Melanzana profondo)**: `#3F3D56`
- **Iconic Accent (Coral Pink / Ciliegio)**: `#FF6584`
- **Warm Accent (Legno di faggio / Peach)**: `#DEA684`
- **Tipografia**: Titoli in `Lora`, testo in `Geist`/`Inter`, codice in `JetBrains Mono`.

---

## 6. Decisioni di Confine e YAGNI (Out of Scope)

- **Status Page interna**: Esclusa categoricamente per evitare finti indicatori di uptime su architetture self-hosted/edge.
- **Changelog manuale**: Escluso per evitare debito di duplicazione; sostituito da link a GitHub Releases.
- **Editor interattivi in-browser**: Esclusi per preservare la leggerezza di VitePress.
- **Automazione OpenAPI complessa a runtime**: Rimandata; la REST Reference viene organizzata modularmente tramite file Markdown statici strutturati per slice.
