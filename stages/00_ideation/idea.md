# Proposta Feature: Multi-Language & Field Localization (i18n) (Issue #109)

## 1. Visione & Contesto (Sintesi di Issue #109 ed Evoluzione Architetturale)
Nelle applicazioni reali (siti vetrina commerciali, e-commerce internazionali, cataloghi multilingua), supportare più lingue è un requisito standard.
Senza supporto nativo all'internazionalizzazione (i18n), gli sviluppatori sono costretti a due compromessi deleteri:
1. **Inquinare lo schema con campi duplicati** (es. `title_it`, `title_en`, `desc_it`, `desc_en`), degradando la DX del codice, la chiarezza delle query e l'usabilità del pannello di amministrazione.
2. **Duplicare i record (Document-level localization)**, compromettendo la coerenza delle relazioni (Foreign Keys), frammentando la gestione di magazzino/inventario, gli identificativi di sistema e le metriche di analytics.

### L'approccio scelto: Field-Level Localization
Vogliamo implementare una **localizzazione a livello di Branch (Field-Level Localization)** in cui i campi abilitati memorizzano un dizionario JSON all'interno di una colonna SQLite `TEXT`.
Questa scelta preserva l'identità univoca dell'entità (un solo ID, una sola riga, relazioni FK e analytics intatte), eliminando al contempo tabelle ponte di traduzione complesse che appesantirebbero D1 e le transazioni serverless.

Rispetto alla bozza originaria preliminare di Issue #109, la feature deve superare le criticità tecniche emerse dall'architettura consolidata di BeechCMS:
- **Gestione sicura di FTS5**: evitare che chiavi JSON e sintassi inquinino gli indici di ricerca full-text.
- **Logica di Fallback deterministica (`COALESCE`)**: non restituire mai `NULL` o errori se un contenuto non è ancora stato tradotto nella lingua richiesta ma esiste nel locale predefinito.
- **Supporto a filtri e ordinamento**: consentire query e filtri su campi localizzati senza full-table scan cieche.
- **Integrazione con lo stack moderno di BeechCMS**: piena interoperabilità con Typed Client SDK (`@beechcms/client`), Schema Manifest (`beech.schema.ts`), CLI type generation (`@beechcms/cli`) e l'Entry Editor della Dashboard.

---

## 2. Cosa Vogliamo dalla Feature (Pilastri Architetturali)

### A. Definizione di Schema e Configurazione dei Locales (Single Source of Truth)
- **Configurazione globale delle lingue di progetto**:
  - Definizione centralizzata nel manifest di schema (`beech.schema.ts`) e nelle impostazioni di sistema (`SiteSettings`):
    - `locales: string[]` (elenco dei codici lingua supportati dal progetto, es. `['it', 'en', 'de']`).
    - `defaultLocale: string` (lingua predefinita di fallback, es. `'it'`).
- **Abilitazione a livello di Branch**:
  - Proprietà booleana `localized?: boolean` sull'interfaccia `Branch`.
  - Applicabile rigorosamente ai soli tipi testuali/contenutistici: `text`, `richtext`, `json` (escludendo tipi intrinsecamente condivisi o strutturali come `number`, `boolean`, `date`, `file`, `relation`, `repeater`).
  - Esposizione nel manifest DSL: `defineField.text({ alias: 'name', label: 'Nome', localized: true })`.

### B. Storage, Serializzazione e Botanical Engine (D1 / SQLite)
- **Rappresentazione a Database**:
  - La colonna fisica su SQLite rimane di tipo `TEXT`.
  - Il dato viene serializzato come JSON compatto normalizzato: `{"it": "Scarpa", "en": "Shoe"}`.
  - Normalizzazione trasparente: se un payload o un import passa una stringa semplice, questa viene automaticamente associata al `defaultLocale`. Stringhe vuote e chiavi orfane vengono ripulite.
- **Query SELECT e Fallback Trasparente**:
  - Quando una query richiede una lingua (`locale: 'en'`), il Botanical Engine estrae il valore garantendo il fallback SQL:
    ```sql
    COALESCE(
      json_extract(table.col, '$.' || :lang),
      json_extract(table.col, '$.' || :defaultLang),
      table.col
    ) AS col
    ```
  - Questo garantisce che le API pubbliche e il frontend non ricevano mai valori vuoti/nulli in caso di traduzione parziale, rispettando i vincoli di schema (`requiredOnCreate`).
- **Filtri e Ricerca su Campi Localizzati**:
  - Il compilatore query traduce le condizioni `WHERE` sui campi localizzati estraendo la chiave JSON corrispondente al locale attivo (`json_extract(table.col, '$.' || :lang)`).
- **Full-Text Search (FTS5) Pulito**:
  - I trigger automatici SQLite della tabella virtuale FTS (`fts_<slug>`) non devono indicizzare il JSON grezzo (chiavi `"it":` e virgolette inquinerebbero il tokenizzatore).
  - I trigger devono estrarre e indicizzare i soli valori testuali puliti di tutte le lingue registrate, garantendo che una ricerca trovi il record indipendentemente dalla lingua usata dall'utente.

### C. Public API Layer & Content Negotiation (`apps/api`)
- **Negoziazione della Lingua**:
  - Risoluzione automatica della lingua con la seguente gerarchia:
    1. Parametro di query `?lang=<code>` (priorità massima)
    2. Header HTTP standard `Accept-Language`
    3. Fallback sul `defaultLocale` di progetto.
  - Risposta sempre "piatta" per il frontend pubblico: `{ id: "123", name: "Shoe", price: 10 }` (zero parsing JSON a carico del client).
- **Modalità Raw / Tutte le Traduzioni**:
  - Parametro speciale `?lang=all` (o `?lang=*`) per consentire a client speciali, export o backoffice di ottenere l'intero dizionario traduzioni (`{ name: { it: "Scarpa", en: "Shoe" } }`).
- **Edge Caching & ETag Awareness**:
  - Inclusione della lingua risolta nella chiave di cache di Cloudflare Edge Cache e aggiunta automatica dell'header `Vary: Accept-Language`.

### D. Typed Client SDK & Type Generation (`@beechcms/client` & `@beechcms/cli`)
- **Fluent Query Builder (`@beechcms/client`)**:
  - Aggiunta del metodo `.lang(code: string)` (e `.locale(...)`) per impostare in modo dichiarativo e leggibile la lingua richiesta nelle chiamate REST.
- **Type Generation (`@beechcms/cli`)**:
  - I tipi generati da `beech schema types` per il consumo API pubblico mantengono i campi localizzati tipizzati come `string` (coerentemente con la proiezione piatta dell'API).
  - Generazione di un tipo helper utility `LocalizedField<T>` (`Record<string, T>`) utilizzabile per script di popolamento o logiche di gestione avanzate.

### E. Dashboard UX (Entry Editor & Content Management)
- **Global Locale Switcher nell'Entry Editor**:
  - Eliminazione di controlli/tab duplicati e dispersivi su ciascun campo.
  - Un unico selettore di lingua principale nell'header dell'Entry Editor (`[ IT | EN | DE ]`).
  - La selezione del locale aggiorna contestualmente tutti i campi `localized` della maschera.
- **Visual Feedback & Fallback nello Studio**:
  - Se un campo non è ancora tradotto nella lingua attiva:
    - Indicazione visiva chiara ("Non tradotto, in uso fallback") con testo placeholder proveniente dalla lingua di default.
    - Pulsante rapido "Copia dal valore predefinito".
  - Indicatore sintetico dello stato di completamento delle traduzioni nella scheda dell'articolo.
- **Supporto RichText**:
  - Integrazione nell'editor Tiptap per la gestione del documento strutturato JSON differenziato per ciascuna lingua.

---

## 3. Delimitazioni e Ambito Fuori Scope (YAGNI v1)
Per mantenere il lavoro focalizzato, pulito ed evitare derive di complessità non necessarie:
- **NO Localized System Slugs (URL Slugs Tradotti)**:
  - Lo `slug` del record resta un identificatore univoco di sistema globale (es. `scarpa-running-pro`).
  - Non si gestiscono routing complessi o slug differenziati per lingua in questa v1 (richiederebbe routing a documenti separati e tabelle di alias).
- **NO Traduzione Automatica Integrata (AI / DeepL out-of-the-box)**:
  - Nessuna integrazione nativa con provider di traduzione automatica in questo core sprint (delegabile a script esterni, automazioni o al tool MCP `@beechcms/mcp`).
- **NO Traduzione dell'Interfaccia Dashboard (UI i18n)**:
  - L'ambito è esclusivamente il **Content i18n** (i dati del CMS), non la traduzione dei testi o dei menu della console di amministrazione.
- **NO Permessi di Modifica per Singola Lingua (RBAC granulare)**:
  - Nessuna restrizione del tipo "l'editor X può modificare solo la lingua DE". I permessi di scrittura sul record rimangono unificati.
