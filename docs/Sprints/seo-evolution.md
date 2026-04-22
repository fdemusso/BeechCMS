# Sprint: SEO & Meta-Engine Evolution

Questo documento delinea la strategia per trasformare i metadati base di BeechCMS in un motore SEO professionale, centralizzato e pronto per le esigenze del web moderno.

## Obiettivi
- Centralizzare la gestione dei metadati per evitare duplicazioni nei Seed.
- Potenziare le capacità di condivisione social (Open Graph).
- Introdurre automazioni per i dati strutturati (Schema.org).
- Migliorare l'authoring experience con feedback visivi.

---

## Fase 1: Centralizzazione (SEO Mixin)
Uscire dal modello "WET" (Write Everything Twice) per passare a uno standard centralizzato nel core.

- [ ] **Standard SEO Branches:** Definizione di una costante `SEO_STANDARD_BRANCHES` in `packages/core/src/seeds.ts` che contiene i campi base.
- [ ] **Refactoring Seeds:** Aggiornamento di tutti i Seed esistenti (Articoli, Prodotti, Pagine) per utilizzare lo spread dei campi standard.
- [ ] **Schema Validation:** Assicurarsi che il Botanical Engine tratti questi campi in modo uniforme su tutti i tipi di contenuto.

## Fase 2: Social & Technical SEO
Andare oltre i semplici titoli e descrizioni per supportare i protocolli moderni.

- [ ] **Open Graph (og:image):** Aggiunta di un campo `file` specifico per l'immagine social, con fallback automatico alla `coverImage` del contenuto se non compilato.
- [ ] **Canonical URL:** Introduzione del supporto per URL canonici per prevenire problemi di "duplicate content".
- [ ] **Robots Control:** Aggiunta di un flag (toggle) per abilitare/disabilitare l'indicizzazione (`noindex`) per contenuti specifici.

## Fase 3: Automazione & Data Richness
Sfruttare la potenza dello schema-driven design di Beech per aiutare i motori di ricerca.

- [ ] **JSON-LD Generator:** Creazione di una utility che genera frammenti di dati strutturati basati sul tipo di Seed (es. `Product` per i prodotti, `Article` per i blog).
- [ ] **Dynamic Meta Fallback:** Implementazione di logica lato API per popolare i meta-tag mancanti partendo dal contenuto (es. se `metaDescription` è vuoto, usa un estratto del `body`).

---

## Fase 4: Dashboard Experience (UX)
Migliorare la vita di chi scrive i contenuti.

- [ ] **SEO Snippet Preview:** Realizzazione di un componente React nella dashboard che simula visivamente l'aspetto della pagina su Google e su un post social (testo + immagine).
- [ ] **Visual Counters:** Aggiunta di misuratori "semaforici" per indicare la lunghezza ottimale di titoli (50-60 char) e descrizioni (150-160 char).

> [!IMPORTANT]
> **Il Vantaggio Architetturale**
> Centralizzare la SEO con un Mixin significa che aggiungere una nuova funzionalità (es. supporto per i meta-tag di Pinterest o nuove specifiche Schema.org) richiede **una sola riga di codice** nel core, propagandosi istantaneamente su tutti i contenuti del CMS senza necessità di migrazioni manuali.
