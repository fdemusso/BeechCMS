# Piano d'azione tecnico: Field types e viste Beech CMS

Analisi sullo stato attuale del codice (Botanical Engine, Content Engine, Table View) e piano per completare i tipi di dato e le viste (Form, Grid, Kanban).

---

## Stato attuale (sintesi)

- **DB**: `content_entries(id, schema_slug, slug, status, data TEXT, created_at, updated_at)`. Il payload utente vive in `data` come JSON. Colonne `slug` e `status` gestite nativamente dall'API (Fase 1).
- **Botanical Engine** (`@beech/core`): `BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date'`. Traslazione alias ↔ ID solo per chiavi; unica logica "speciale" è il double-parse per `json` in `dbToApi`.
- **Content Engine** (API): CRUD su `content_entries`; legge/scrive `id`, `schema_slug`, `slug`, `status`, `data`, `created_at`, `updated_at`. Endpoint `GET /:schema_slug/by-slug/:entry_slug` per fetch pubblica.
- **Field Renderers** (Fase 2 completata): `components/fields/` con `FieldDisplay`, `FieldEdit`, registro `BranchType → componente`. Nessuno switch su `branch.type` nelle viste.
- **Table View**: `generateColumns` usa `FieldDisplay` per ogni cella; `ContentEditDialog` usa `FieldEdit` per ogni campo.

---

## 1. Ristrutturazione roadmap field types

### 1.1 Allineamento alla struttura dati attuale

Il motore **non modella** il tipo a livello di storage: tutto è JSON. Quello che conta è:

- **Serializzazione**: come si scrive/legge in `data` (stringa, numero, boolean, array, oggetto).
- **Comportamento in engine**: oggi solo `json` ha trattamento speciale (double-parse in `dbToApi`). Gli altri tipi sono pass-through.
- **UI**: Table/Form/Grid/Kanban scelgono come mostrare/editare in base a `branch.type` (e eventualmente a `branch.options` o `branch.format`).

Quindi la roadmap va intesa come **estensione di `BranchType` e di eventuali metadati sul Branch** (es. `format`, `relationTarget`), non come cambiamento del modello di storage.

### 1.2 Roadmap riscritta (CORE + opzionali)

**Set CORE** (in `BranchType`, da implementare):

| Tipo engine | Storage in `data` | Note |
|-------------|-------------------|------|
| `text` | string | Già presente. |
| `number` | number | Già presente. |
| `boolean` | boolean | Già presente (in UI "checkbox"). |
| `date` | string ISO / number (epoch) | Già presente. Estendere a `datetime` = stesso storage, solo formato UI diverso. |
| `json` | object / array | Già presente. Usato per metadati, blocchi custom. |
| **`richtext`** | string | **Spostato in CORE.** Stesso storage di `text`. Differenza: `format` (plain \| markdown \| html) e UI editor dedicata. |
| **`slug`** | string | **Spostato in CORE.** Stesso storage di `text`. Validazione: lowercase, no spazi; opzionale `sourceField` per auto-generazione da titolo. |
| `select` | string | Valore = una delle `options`. |
| `multiselect` | string[] | Array di valori da `options`. |
| `tag` | Record<string, string> (tag → colore) | **Accorpabile** con struttura "lista con metadati": come oggi i tags in JSON. **TODO:** `Branch.options?: string[]` funge da vocabolario predefinito — lista statica nel Seed, non salvata nel DB. Usata in FieldEdit (badge cliccabili come suggerimenti) e in ContentToolbar (dropdown filtri con unione opzioni statiche + tag scansionati dai dati esistenti). |
| `url` | string | Validazione URL. |
| `email` | string | Validazione email. |
| `phone` | string | Validazione/formatting opzionale. |
| `file` / `media` | string \| string[] | URL singolo o array (`asset-list`). Dopo upload R2, si salva l'URL in `data`. Consigliato usare `multiple: true` o `format: 'asset-list'` per semantica esplicita. |
| `relation` | string \| string[] | ID (o lista ID) di entry di un altro `schema_slug`. "Leggera" = niente FK nel DB, solo valore in JSON. |
| `place` | object (es. `{ address, lat, lng }`) | Un solo formato concordato; storage = JSON. |
| `color` | string (hex) | Opzionale; può essere anche `text` con validazione. |

**Accorpamenti consigliati (solo lato tipo / UI, non obbligatorio):**

- **`tag` e `multiselect`**:
  - **Opzione A**: tenere `tag` (Record<string, string>) e `multiselect` (string[]) come tipi distinti: struttura dati diversa (tag con colore vs lista di opzioni).
  - **Opzione B**: un solo tipo `list` con `variant: 'multiselect' | 'tag'` e valore `string[]` o `Record<string, string>`; la UI decide come renderizzare.
  Consiglio: **Opzione A** per ora (meno refactor), con possibile unificazione successiva se servisse.

- **`date` e `datetime`**: stesso tipo `date` con proprietà opzionale `format: 'date' | 'datetime'` (o `includeTime: boolean`). Stesso storage (ISO string o epoch).

**Esclusi (come da roadmap):** formule, timestamp automatici (created/updated restano colonne di sistema).

---

## 2. Impatto sul database: richtext, slug, status, relation

### 2.1 Richtext

- **Storage**: stringa in `data`, come `text`. Nessuna nuova colonna, nessun indice.
- **Engine**: aggiungere `'richtext'` a `BranchType`; in `apiToDb`/`dbToApi` trattarlo come `text` (nessuna trasformazione).
- **Branch**: opzionale `format?: 'plain' | 'markdown' | 'html'` per editor e preview.
- **Performance**: nessun impatto. I blob grandi sono già gestiti (D1 TEXT; eventuale limite dimensione da considerare a livello di API/validazione).

### 2.2 Slug — colonna nativa (obbligatorio, no json_extract)

- **Regola architetturale**: non si usa mai `json_extract` per cercare lo slug. Sarebbe letale per le performance in produzione.
- **Storage**: colonna dedicata `slug TEXT` nella tabella `content_entries`, con `UNIQUE(schema_slug, slug)` (indice).
- **Migrazione**: aggiungere la colonna `slug` e l'indice univoco; eventuale backfill da branch esistente se necessario.
- **API**: INSERT e UPDATE nel Content Engine devono scrivere il valore nella colonna `slug`; le query di fetch pubbliche (es. "dammi l'entry per questo slug") devono usare l'indice su `(schema_slug, slug)` (es. `GET /:schema_slug/by-slug/:slug` o equivalente).
- **Auto-generazione da titolo**: solo lato dashboard (o API); il valore risultante viene comunque persistito nella colonna `slug`.

### 2.3 Status — colonna di sistema (obbligatorio, fuori dal JSON)

- **Regola architetturale**: lo stato di pubblicazione (Bozza, Pubblicato, ecc.) è un dato di sistema, non un campo del payload. Salvarlo in `data` sarebbe un errore di normalizzazione.
- **Storage**: la colonna `status` esiste già in `content_entries`; deve essere l'unica fonte di verità per lo stato.
- **API**: il Content Engine deve leggere e scrivere nativamente la colonna `status` in tutte le operazioni CRUD (SELECT, INSERT, UPDATE). Il body delle richieste può accettare `status` come campo di primo livello (non dentro `data`).
- **Viste**: la Kanban View e i filtri lavorano *esclusivamente* su questa colonna di sistema.

### 2.4 Relation (leggera)

- **Storage**: in `data`, valore `string` (uno) o `string[]` (molti). Nessuna tabella di join, nessun EAV.
- **Engine**: nessuna trasformazione; pass-through come per `text`. Opzionale: in `Branch` aggiungere `relationTarget?: string` (schema_slug di destinazione) per UI (picker, resolver).
- **Performance**: nessun impatto. Il "resolver" (mostrare titolo invece di ID) è lato client o con endpoint dedicato:
  - **Opzione 1**: dashboard carica le entry correlate quando serve (es. per ogni riga o per pagina). Rischio N+1 se le relation sono tante.
  - **Opzione 2**: endpoint `POST /content/resolve` che accetta `{ schema_slug, ids: string[] }` e restituisce `{ id -> { title, slug? } }` per evitare N+1. Nessuna modifica alle tabelle.

In sintesi: slug e status sono gestiti tramite colonne native e CRUD aggiornato; relation resta in `data` senza modifiche schema.

---

## 3. Architettura viste (modulare e riutilizzabile)

### 3.1 Problema attuale (risolto in Fase 2)

~~Table e Form avevano switch duplicati su `branch.type`.~~ Con l'introduzione dei Field Renderers, Table e ContentEditDialog usano solo `FieldDisplay` e `FieldEdit`; la mappatura tipo → componente è centralizzata nel registro.

### 3.2 Layer "field" e viste che lo usano (implementato)

- **1) Field renderers (display + edit)**
  Creare un modulo (es. `apps/dashboard/src/components/fields/` o `lib/field-renderers.tsx`) che espone, per ogni `BranchType`:
  - **Display**: componente "solo lettura" per uso in Table (cella), Grid (card), Kanban (card).
    Es. `FieldDisplay({ branch, value })` → Badge per tag, link per url, thumbnail per file, ecc.
  - **Edit**: componente "edit" per Form (e eventuale inline-edit).
    Es. `FieldEdit({ branch, value, onChange })` → Input, Select, Textarea, RichTextEditor, SlugInput, RelationPicker, ecc.

- **2) Registro per tipo**
  Una mappa `FIELD_DISPLAY[branch.type]` e `FIELD_EDIT[branch.type]` (con fallback per tipi sconosciuti → testo/textarea). Così aggiungere un tipo = aggiungere due componenti e registrarli.

- **3) Table View**
  - `generateColumns` usa solo `FieldDisplay`: per ogni branch, `cell: ({ row }) => <FieldDisplay branch={branch} value={row.original.data[branch.alias]} />`.
  - Logiche specifiche (copy, expand, sort) restano wrapper o opzioni del FieldDisplay (es. `copyable`, `expandable`).

- **4) Form View**
  - Una pagina (o drawer) "Entry Editor" con layout a form: per ogni branch, `<FieldEdit branch={...} value={...} onChange={...} />`.
  - Per **richtext** dare spazio predominante (es. area principale sopra/sotto gli altri campi).
  - Lo stesso set di componenti può alimentare anche il dialog di edit attuale (`ContentEditDialog`), così il dialog diventa un "form in piccolo" e la Form View un "form a tutta pagina".

- **5) Grid / Card View**
  - Stessi `data` e `seed` della lista.
  - Layout a griglia di "card": ogni card è una entry; per ogni entry si renderizzano pochi campi (es. titolo, immagine, tag) usando **FieldDisplay**.
  - Scelta dei campi da mostrare in card configurabile (seed o preferenza utente). Nessun nuovo dato, solo altro layout.

- **6) Kanban View**
  - Colonne = valori dinamici della colonna di sistema **status** (es. "draft", "review", "published"). Non si usa un campo `select` dentro `data`.
  - Le card sono le entry; il contenuto della card usa **FieldDisplay** per titolo e eventuali sotto-campi.
  - Trascinamento = aggiornamento della colonna `status`: alla drop, l'API riceve il nuovo `status` come campo top-level del body (non in `data`).
  - Filtri e raggruppamenti Kanban lavorano esclusivamente sulla colonna `status`.

### 3.3 Flusso dati unico

- **Fonte**: `fetchContentListServer(slug, query)` → `{ items, total, page, limit }` (o `fetchContentList(slug)` in modalità legacy); `getSeed(slug)` → definizione campi.
- **Viste**: ricevono `(entries, seed)` (e eventualmente "view options": quale campo per Kanban, quali campi in Grid).
- **Aggiornamento**: dopo create/update/delete si richiama `loadData()` e si aggiornano le stesse strutture; Table/Grid/Kanban si ri-renderizzano con i nuovi dati.

Questo approccio evita riscritture: la Table diventa "solo" un uso dei field display; Form View e Grid/Kanban sono nuovi layout sugli stessi dati e sugli stessi componenti campo.

---

## 4. Colli di bottiglia e rischi di progettazione

### 4.1 Cose che **non** richiedono riscritture massive

- **Aggiungere tipi di campo**: estendere `BranchType`, aggiungere casi in `FieldDisplay`/`FieldEdit` (e nel registro), eventualmente opzioni su `Branch` (format, options, relationTarget). Engine e API restano quasi invariati.
- **Form View a tutta pagina**: riuso di `FieldEdit` e stesso `onSave` → `updateContent` / `createContent`.
- **GridView**: solo nuovo layout + scelta campi; dati e API come oggi.
- **Kanban**: lettura lista + update su drop; PUT già supporta "sostituzione" del `data` con il campo select aggiornato.

### 4.2 Punti di attenzione (e possibili riscritture limitate)

1. **Status e slug (obbligatori)**
   - **Status**: il Content Engine deve leggere e scrivere la colonna `status` in tutte le operazioni; Kanban e filtri usano solo questa colonna.
   - **Slug**: colonna dedicata `slug` + UNIQUE(schema_slug, slug); INSERT/UPDATE scrivono in colonna; fetch pubbliche usano l'indice. Nessun uso di `json_extract` per lo slug.

2. **Relation e N+1**
   Se in Table/Grid si mostrano molte relation e per ognuna si risolve il titolo con una GET, si crea N+1. Mitigazioni: endpoint batch "resolve", o mostrare solo ID/link nella lista e titolo solo in Form/dettaglio.

3. **File/Media e R2**
   Oggi non c'è upload. Aggiungere "file/media" significa: endpoint upload → R2, restituzione URL; il campo in `data` salva solo l'URL. Il Content Engine non cambia; è lavoro nuovo (upload + bucket), non riscrittura.

4. **PATCH parziale**
   Oggi il PUT sostituisce tutto `data`. Per Kanban è sufficiente: si manda l'intero oggetto con un campo modificato. Se in futuro servisse "aggiorna solo il campo X" (es. per conflitti o performance), si aggiungerebbe un PATCH che fa merge su `data`; è un'estensione dell'API, non una riscrittura.

5. **Richtext e dimensioni**
   Contenuti molto grandi in un unico campo JSON possono avvicinarsi ai limiti di D1/request body. Monitorare e eventualmente: limiti di dimensione in validazione, o in futuro considerare storage esterno per blob (es. R2) con riferimento in `data`. Per la maggior parte dei casi "articolo/pagina" non è un problema.

### Modello mentale UI (lock-in)

- Registro centralizzato: ogni `BranchType` ha un `<FieldDisplay />` e un `<FieldEdit />`.
- Nessun grosso `switch(branch.type)` sparsi nei file delle viste: Table, Form, Grid e Kanban usano solo i renderers del registro.

### 4.3 Riepilogo "spietato"

- **Content Engine**: progettazione solida. Per produzione è obbligatorio: colonna `slug` nativa + indice, e uso nativo della colonna `status` in CRUD. Nessun json_extract per slug; status fuori dal JSON.
- **Botanical Engine**: estendere tipi e, se serve, proprietà su Branch (format, options, relationTarget). Nessun cambio al modello di storage.
- **Dashboard**: i **field renderers** sono implementati; Table e ContentEditDialog li usano. Restano da implementare Form View, Grid e Kanban come nuovi layout sugli stessi componenti.

---

## 5. Ordine di esecuzione (sequenza obbligatoria)

Seguire **esattamente** questa sequenza in tre fasi.

### Fase 1: Fondamenta dati (DB & API)

- **Schema D1**: migrazione che aggiunge la colonna `slug TEXT` a `content_entries` e indice `UNIQUE(schema_slug, slug)` (slug nullable per retrocompatibilità).
- **Content Engine**: aggiornamento CRUD per gestire nativamente le colonne `slug` e `status`:
  - SELECT: includere `slug` e `status` in tutte le query e in `rowToEntry` / `ContentEntry`.
  - INSERT: accettare `slug` e `status` (body), scriverli in colonna; validare unicità slug per schema_slug.
  - UPDATE: accettare `slug` e `status`, aggiornare le colonne.
  - Fetch pubblica per slug: endpoint (es. `GET /:schema_slug/by-slug/:slug`) che usa l'indice per restituire una singola entry.

### Fase 2: Astrazione UI (il cuore del CMS) — **COMPLETATA**

- [x] Creazione dell'infrastruttura **Field Renderers**: registro centralizzato; per ogni `BranchType` un `<FieldDisplay />` (Table, Grid, Kanban) e un `<FieldEdit />` (Form, Dialog).
- [x] Refactoring della **Table View** e del **ContentEditDialog** per usare i renderers; eliminazione dei grossi `switch(branch.type)` sparsi nei file.
- Vedi [Field Renderers](field-renderers.md) per la documentazione.

### Fase 3: Espansione tipi e viste

- Aggiunta dei tipi Core mancanti (Richtext, Slug UI, File/Media via R2, ecc.).
- **Form View** a pagina intera (layout form con FieldEdit; spazio predominante per richtext).
- **Kanban View** basata sulla colonna `status` (colonne = valori di status; drag = aggiornamento status).
- **Grid View** per gestione visiva media/galleria (card con FieldDisplay).

---

Questo documento è il riferimento vincolante per schema DB, API e ordine di implementazione.
