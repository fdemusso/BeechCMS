# Sprint 01 — Gallery View (Bento Grid + Notion-like Card Expansion)

> **Documento per:** Agente AI di sviluppo (Claude / Gemini)
> **Tipo:** Prompt di implementazione iterativa
> **Priorità:** Alta — blocca il "free tier" gallerie e blog

---

## `<role>`

Sei un **Senior Frontend Engineer** specializzato in React, TypeScript e Tailwind CSS, che lavora su **Beech CMS** — un CMS headless schema-driven su Cloudflare (stack: React 19 + Vite + TailwindCSS 4 + TanStack Table + Hono + Cloudflare D1/R2).

Conosci perfettamente l'architettura del progetto:
- Il **Botanical Engine** (`@beech/core`) traduce alias API ↔ ID interni DB; **non devi mai accedere ai dati con chiavi `br_xxx` ma sempre tramite le funzioni `getSeed`, `apiToDb`, `dbToApi`**.
- Il **Field Renderer Registry** (`apps/dashboard/src/components/fields/registry.ts`) è il punto di estensione per ogni tipo di campo. Tutti i nuovi renderer devono essere registrati lì.
- Le view attive sulla `ContentListPage` sono già gestite tramite `activeViewId` e l'array `views: UserViewInstance[]`. Attualmente esiste solo la view `"table"`. La Gallery View sarà la **seconda view**.
- I dati arrivano dall'API `GET /api/content/:slug` nella forma `{ items: ContentEntry[], total, page, limit }`.

## `</role>`

---

## `<task>`

**Implementa la Gallery View** di Beech CMS: una vista a **Bento Grid regolare** (stile Notion Gallery / Linear Board) che si attiva in alternativa alla vista tabella tramite il sistema di view già esistente in `ContentListPage`.

Ogni elemento della griglia è una **Card** che mostra le informazioni essenziali dell'entry e, al clic, si espande in un **pannello laterale "peekable"** che scorre su dal basso o appare da destra — simile a come Notion apre una pagina inline (click → pagina si apre sopra la griglia con animazione slide-up/right, overlay semitrasparente dietro, X per chiudere) senza navigare via dalla lista.

## `</task>`

---

## `<context-architecture>`

### File chiave da leggere PRIMA di scrivere codice

| File | Cosa contiene |
|------|--------------|
| `apps/dashboard/src/pages/content-list.tsx` | La page che gestisce le view; contiene `activeViewId`, `views`, e il render condizionale del `<DataTable>`. La Gallery View va aggiunta qui come branch `else if (activeViewId === "gallery")`. |
| `apps/dashboard/src/components/content-toolbar/index.tsx` | Gestisce la toolbar sopra la lista, incluso il bottone per cambiare view. Va aggiornato per includere il tipo `"gallery"` nell'enum dei tipi di view. |
| `apps/dashboard/src/lib/dynamic-columns.tsx` | Contiene `ContentEntry` (il tipo dati delle entry) — usalo direttamente, non ridefinirlo. |
| `apps/dashboard/src/components/fields/index.tsx` | Barrel export dei field renderers; usa `<FieldDisplay branch={b} value={v} />` per mostrare i valori delle card. |
| `packages/core/src/types.ts` | Definisce `Seed`, `Branch`, `BranchType`. |
| `packages/core/src/seeds.ts` | Contiene `ARTICOLO_SEED` (blog) e altri seed. La Gallery View deve funzionare con qualsiasi Seed, non solo con quello degli articoli. |

### Struttura di `ContentEntry` (non ridefinire, importa da `@/lib/dynamic-columns`)

```typescript
interface ContentEntry {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: Record<string, unknown>  // chiavi = alias (es. "title", "coverImage")
  created_at: number | null
  updated_at: number | null
}
```

### Come funziona il sistema di view (`UserViewInstance`)

```typescript
// Esistente in content-list.tsx
type UserViewInstance = {
  id: string
  label: string
  type: "table" | "gallery"   // aggiungi "gallery" all'union type
  enabledTools: string[]
  conditionalFormats: ConditionalFormatRule[]
}

// La view di default gallery da aggiungere all'array initializer:
{
  id: "gallery",
  label: "Galleria",
  type: "gallery",
  enabledTools: ["filter", "sort", "search", "create"],
  conditionalFormats: [],
}
```

## `</context-architecture>`

---

## `<specification>`

### 1. Bento Grid Layout

- **Layout:** CSS Grid responsivo. Usa colonne auto-fill con `minmax(260px, 1fr)` — niente breakpoint fissi da gestire a mano, il grid si adatta da solo.
- **Gap:** `1rem` tra le card (Tailwind: `gap-4`).
- **Altezza card:** fissa, **non variabile** — tutte le card hanno la stessa altezza (es. `280px` o `320px`). Questo garantisce la griglia "regolare" richiesta. Il contenuto eccedente va troncato, non le card cambiano altezza.
- **Nessuna implementazione a "masonry"** (colonne di altezze diverse). Se il designer futuro la vuole, sarà un sprint separato.

### 2. Anatomia di una Card

Ogni card mostra i dati dell'entry con questa **gerarchia visiva fissa**, indipendente dallo schema:

```
┌──────────────────────────────┐
│  [COVER IMAGE o Placeholder] │  ← h: 140px, object-cover
│  (branch di tipo `file`      │
│   con alias che contiene     │
│   "cover", "image", "foto",  │
│   "photo" — euristica)       │
├──────────────────────────────┤
│  [STATUS BADGE]   [TAGS]     │  ← riga badge, max 2 tag poi "+N"
├──────────────────────────────┤
│  Titolo dell'entry           │  ← branch con alias "title" o "name"
│  (max 2 righe, line-clamp-2) │
├──────────────────────────────┤
│  Excerpt (50 char max)       │  ← primo branch `richtext` o `text` lungo
│                              │
├──────────────────────────────┤
│  📅 Data pubblicazione       │  ← primo branch `date`
└──────────────────────────────┘
```

**Euristica per trovare i campi nella card** (implementa come funzione `resolveCardFields(seed: Seed)` nello stesso file del componente):

```typescript
function resolveCardFields(seed: Seed): {
  coverBranch: Branch | null     // tipo "file", alias ~= cover/image/foto/photo
  titleBranch: Branch | null     // alias === "title" || alias === "name"
  excerptBranch: Branch | null   // primo branch richtext o text lungo (non title)
  dateBranch: Branch | null      // primo branch tipo "date"
  tagsBranch: Branch | null      // primo branch tipo "json" con alias ~= "tag"
}
```

Se nessun branch corrisponde all'euristica, il campo è `null` e lo slot nella card viene omesso (no placeholder di testo, semplicemente il blocco non occupa spazio).

**Placeholder immagine:** Se `coverBranch` è null o il valore è vuoto, mostra un `div` con sfondo `bg-muted` e un'icona `ImageIcon` dal pacchetto `lucide-react`, centrata.

### 3. Interazione Card → Pannello di Dettaglio (Notion-like)

**Comportamento target** (simile a Notion "Peek" / apertura pagina in overlay):

1. L'utente clicca sulla card.
2. Il contenuto corrente (la griglia) rimane visibile **dietro un overlay semitrasparente** (`bg-black/40 backdrop-blur-sm`).
3. Un pannello laterale appare **da destra** con animazione `translate-x-full → translate-x-0` (durata 250ms, easing `ease-out`). Oppure, su viewport < 768px, appare **dal basso** con `translate-y-full → translate-y-0`.
4. Il pannello ha **larghezza fissa** `w-[680px]` su desktop, `w-full` su mobile.
5. **Dentro il pannello** si mostrano tutti i campi dell'entry renderizzati con i `<FieldDisplay>` esistenti — è essenzialmente la stessa logica dell'`EntryEditorPage` ma in read-only con un layout verticale.
6. Il pannello ha:
   - Un header fisso con il titolo dell'entry e i bottoni `Chiudi (X)` e `Modifica (→ naviga a /content/:slug/:id)`.
   - Uno scroll interno per il contenuto.
7. **Chiusura:** click sull'overlay, tasto `Escape`, o click su X.

**Gestione stato:** Lo stato del pannello è locale alla Gallery View component:

```typescript
const [peekId, setPeekId] = React.useState<string | null>(null)
const peekEntry = React.useMemo(
  () => data.find(e => e.id === peekId) ?? null,
  [data, peekId]
)
```

**Non navigare** a `/content/:slug/:id` a meno che l'utente non clicchi esplicitamente su "Modifica".

### 4. Struttura file da creare

```
apps/dashboard/src/components/
└── content-gallery/
    ├── index.ts                    ← barrel export
    ├── content-gallery.tsx         ← componente principale Grid + Peek
    ├── gallery-card.tsx            ← singola Card
    ├── gallery-peek-panel.tsx      ← pannello di dettaglio slide-in
    └── resolve-card-fields.ts      ← funzione euristica (pura, testabile)
```

Segui la **convenzione dell'architettura esistente**: ogni componente ha la propria cartella con `index.ts` come barrel export (vedi `content-delete-dialog/` come riferimento).

### 5. Integrazione in `content-list.tsx`

Nel renderizzatore della page, sotto la `<ContentToolbar>`, sostituisci il render condizionale attuale:

```tsx
// PRIMA (solo tabella)
{!isLoading && !error && (
  <DataTable ... />
)}

// DOPO
{!isLoading && !error && activeViewId === "table" && (
  <DataTable ... />
)}
{!isLoading && !error && activeViewId === "gallery" && (
  <ContentGallery
    seed={seed}
    data={data}
    onEdit={handleEdit}
  />
)}
```

Aggiungi la view gallery all'array `views` iniziale (già descritto sopra).

### 6. Aggiornamento toolbar (tipo view)

Nel tipo `UserViewInstance` e ovunque sia definita l'union `type: "table"`, aggiungi `"gallery"`.
Nel componente `ContentToolbar`, aggiungi l'icona per la view gallery (usa `LayoutGrid` da `lucide-react`) accanto all'icona della tabella.

## `</specification>`

---

## `<constraints>`

### Non fare

- ❌ NON usare `useEffect` per derivare dati che si possono calcolare con `useMemo`.
- ❌ NON creare nuove chiamate API dentro la Gallery View — usa i `data` passati come prop da `ContentListPage`. La paginazione e il fetch sono già gestiti lì.
- ❌ NON accedere ai dati del contenuto tramite chiavi `br_xxx` — usa sempre gli alias (`entry.data["title"]`, non `entry.data["art_01"]`).
- ❌ NON introdurre nuove librerie di stato o di animazione — usa solo Tailwind CSS per le transizioni (le classi `transition-transform`, `translate-x-full`, ecc. di Tailwind sono sufficienti).
- ❌ NON duplicare tipi già definiti in `@beech/core` o in `dynamic-columns.tsx`.
- ❌ NON scrivere UI che fa switch manuale sul tipo di branch (es. `if branch.type === "text" render ... else if ...`). Usa sempre `<FieldDisplay branch={b} value={v} />` tranne che per la cover image e il titolo della card, che hanno trattamento visivo speciale.

### Devi

- ✅ Seguire il **Registry Pattern**: se aggiungi nuovi tipi di campo in futuro, non toccare la Gallery View — l'euristica è sufficiente.
- ✅ Mantenere la **compatibilità con qualsiasi Seed**: la Gallery View funziona con `articoli`, `prodotti`, `team`, ecc. senza configurazione extra.
- ✅ Gestire il caso `data = []` (griglia vuota) con un empty state dedicato (es. icona + messaggio "Nessun elemento da visualizzare").
- ✅ Gestire il caso loading con skeleton (usa `div` con `animate-pulse` e `bg-muted` — nessuna libreria esterna).
- ✅ Aggiungere `aria-label` e ruoli semantici corretti al pannello (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
- ✅ Chiudere il pannello su `Escape` (event listener sul `document` con `useEffect` e cleanup).

## `</constraints>`

---

## `<chain-of-thought>`

Prima di scrivere codice, ragiona ad alta voce seguendo questo ordine:

1. **Leggi** i file chiave elencati in `<context-architecture>` (content-list.tsx, content-toolbar, registry.ts, types.ts).
2. **Identifica** dove aggiungere `"gallery"` all'union type di `UserViewInstance.type` — probabilmente in un file types separato o direttamente in `content-toolbar/index.tsx`. Verifica prima.
3. **Progetta** `resolveCardFields` come funzione pura: input `Seed`, output 5 branch nullable. Non accoppiare l'euristica al componente.
4. **Costruisci** nell'ordine: `resolve-card-fields.ts` → `gallery-card.tsx` → `gallery-peek-panel.tsx` → `content-gallery.tsx` → `index.ts` → integrazione in `content-list.tsx`.
5. **Verifica** che il build TypeScript non abbia errori prima di dichiarare il task completato.

## `</chain-of-thought>`

---

## `<output-format>`

Per ogni file che crei o modifichi, fornisci:

1. **Il percorso assoluto** del file (es. `apps/dashboard/src/components/content-gallery/gallery-card.tsx`).
2. **Il codice completo** del file (non frammenti — il file per intero).
3. **Una nota di 2-3 righe** che spiega le decisioni non ovvie prese in quel file.

Alla fine, fornisci una **checklist di verifica**:

```
- [ ] `UserViewInstance.type` include "gallery" ovunque sia usato
- [ ] Il bottone gallery è visibile nella ContentToolbar
- [ ] La grid mostra le card per qualsiasi Seed (test con articoli, prodotti, team)
- [ ] Il pannello si apre/chiude correttamente (click card, overlay, Escape, X)
- [ ] Il bottone "Modifica" nel pannello naviga a /content/:slug/:id
- [ ] Empty state visibile quando data = []
- [ ] Nessun errore TypeScript (npm run build -w @beech/core && npm run build -w dashboard)
```

## `</output-format>`

---

## Note aggiuntive per il prossimo sprint

Questo sprint NON include:
- Drag & drop per riordinare le card (Sprint 02)
- Filtri specifici per la vista galleria (ereditati dalla toolbar esistente — già funzionali)
- Visualizzazione di gallerie di immagini multiple per singola entry (Sprint 02 — richiede tipo di campo dedicato)

---

*Documento creato: 2026-04-07 | Autore: Flavio De Musso | Revisione: Sprint Planning*
