# Dashboard Components

Documentazione dei componenti UI riutilizzabili della dashboard Beech CMS.

**Vedi anche:**
- [Field Renderers](field-renderers.md) — Registry Pattern per display/edit campi schema-driven
- [Botanical Engine](botanical-engine.md) — tipi `Seed`, `Branch`, `BranchType`
- [Content Engine](content-engine.md) — API CRUD e struttura delle entry

---

## `ContentToolbar`

**File:** `apps/dashboard/src/components/content-toolbar.tsx`

Barra di controllo contestuale per le viste contenuto. Raggruppa in un'unica UI:

- **View Switcher** — ToggleGroup per passare tra le viste registrate (tabella, griglia, kanban, grafico)
- **Strumenti** — icone contestuali (filtri, ordinamento, automazione, ricerca, impostazioni, creazione) abilitabili/disabilitabili per singola vista
- **Filter Pills** — pill cliccabili Notion-like, una per colonna, con condizioni AND multiple

```mermaid
flowchart LR
    subgraph toolbar [ContentToolbar]
        ViewSwitcher["View Switcher\n(ToggleGroup)"]
        Tools["Tools\n(filter, sort, automation,\nsearch, settings, create)"]
        FilterPills["Filter Pills\n(una pill per colonna)"]
    end

    seed["Seed\n(branches)"] --> toolbar
    toolbar --> onChangeView
    toolbar --> onFiltersChange
    toolbar --> onSortChange
    toolbar --> onSubmitSearch
    toolbar --> onCreate
```

---

## Props

| Prop | Tipo | Default | Descrizione |
|------|------|---------|-------------|
| `seed` | `Seed` | — | Seed attivo; i suoi `branches` alimentano le colonne filtrabili e ordinabili |
| `views` | `UserViewInstance[]` | — | Viste disponibili per questo seed |
| `activeViewId` | `string` | — | ID della vista correntemente selezionata |
| `onChangeView` | `(viewId: string) => void` | — | Callback al cambio vista |
| `onCreateView` | `() => void` | `undefined` | Apre il flusso di creazione nuova vista (TODO: non ancora implementato) |
| `onRenameView` | `(viewId: string, label: string) => void` | `undefined` | Rinominazione della vista attiva; aggiorna ad es. `UserViewInstance.label` e il relativo toggle |
| `onCreate` | `() => void` | — | Apre il flusso di creazione nuova entry |
| `onOpenFilters` | `() => void` | `undefined` | Callback pannello filtri esterno (opzionale, alternativo alle pills) |
| `onOpenSort` | `() => void` | `undefined` | Callback pannello ordinamento esterno (opzionale) |
| `onOpenAutomation` | `() => void` | `undefined` | Apre il pannello automazioni |
| `onOpenSettings` | `() => void` | `undefined` | Apre le impostazioni della vista |
| `searchValue` | `string` | `""` | Valore controllato del campo di ricerca |
| `onSearchChange` | `(value: string) => void` | `undefined` | Aggiornamento del termine di ricerca |
| `onSubmitSearch` | `(value: string) => void` | `undefined` | Submit della ricerca (invio form) |
| `sortState` | `{ columnId: string \| null; desc: boolean }` | `undefined` | Stato ordinamento corrente |
| `onSortChange` | `(state) => void` | `undefined` | Callback al cambio ordinamento |
| `filters` | `ToolbarFiltersState` | `{}` | Stato filtri corrente (Record columnId → gruppo) |
| `onFiltersChange` | `(state: ToolbarFiltersState) => void` | `undefined` | Callback al cambio filtri |
| `availableTagsByColumnId` | `Record<string, string[]>` | `{}` | Tag disponibili per colonne di tipo `tags` |
| `children` | `React.ReactNode` | `undefined` | Contenuto sotto la toolbar (tabella, kanban, ecc.). Se assente, la sezione inferiore non viene renderizzata |

---

## Tipi esportati

### `ViewType`

```ts
type ViewType = "table" | "grid" | "kanban" | "chart"
```

### `ToolbarTool`

```ts
type ToolbarTool = "filter" | "sort" | "automation" | "search" | "settings" | "create"
```

Ogni vista può abilitare un sottoinsieme di strumenti tramite `UserViewInstance.enabledTools`. Se non specificato, vengono abilitati tutti gli strumenti (`DEFAULT_ENABLED_TOOLS`).

### `UserViewInstance`

```ts
interface UserViewInstance {
  id: string
  label: string
  type: ViewType
  enabledTools: ToolbarTool[]
}
```

### `ToolbarFiltersState`

```ts
type ToolbarFiltersState = Record<string, ToolbarFilterGroup>
```

Record indicizzato per `columnId`. Ogni gruppo contiene una o più condizioni AND.

### `ToolbarFilterGroup`

```ts
interface ToolbarFilterGroup {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: ToolbarFilterCondition[]
  selectOptions?: string[]  // per tipo "select"
}
```

### `ToolbarFilterCondition`

```ts
interface ToolbarFilterCondition {
  id: string
  op: FilterOperator
  value: string | number | boolean | null
}
```

### `FilterGroupType`

```ts
type FilterGroupType = "text" | "number" | "date" | "boolean" | "tags" | "select" | "system"
```

### `FilterOperator`

```ts
type FilterOperator = "eq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_empty" | "is_not_empty"
```

Gli operatori disponibili per tipo sono definiti dalla funzione pura `getOperatorOptions(type)`:

| Tipo | Operatori |
|------|-----------|
| `text`, `system` | `contains`, `eq`, `is_not_empty`, `is_empty` |
| `number`, `date` | `gt`, `lt`, `gte`, `lte`, `eq`, `is_not_empty`, `is_empty` |
| `boolean` | `eq`, `is_not_empty`, `is_empty` |
| `select` | `eq`, `is_not_empty`, `is_empty` |
| `tags` | `contains`, `is_not_empty`, `is_empty` |

---

## Derivazione delle colonne filtrabili da `seed.branches`

Il componente costruisce internamente l'elenco delle colonne filtrabili partendo dai `branches` del seed. Due colonne di sistema sono sempre presenti in cima:

| `columnId` | Tipo | Note |
|------------|------|------|
| `slug` | `system` | Identificatore URL dell'entry |
| `status` | `select` | Valori: `["draft", "published"]` |

I branch vengono mappati secondo questa logica:

| `branch.type` | `FilterGroupType` assegnato |
|---|---|
| `number` | `number` |
| `date` | `date` |
| `boolean` | `boolean` |
| `json` con alias contenente `"tag"` | `tags` |
| `text`, `richtext`, `file` | `text` |
| altri | `text` (fallback) |

---

## Esempio di utilizzo minimo

```tsx
import { ContentToolbar, type UserViewInstance } from "@/components/content-toolbar"

const views: UserViewInstance[] = [
  { id: "v1", label: "Tabella", type: "table", enabledTools: ["filter", "sort", "search", "create"] },
  { id: "v2", label: "Griglia", type: "grid", enabledTools: ["search", "create"] },
]

function ContentPage({ seed, entries }) {
  const [activeViewId, setActiveViewId] = useState("v1")
  const [filters, setFilters] = useState({})
  const [sortState, setSortState] = useState({ columnId: null, desc: true })
  const [searchValue, setSearchValue] = useState("")

  return (
    <ContentToolbar
      seed={seed}
      views={views}
      activeViewId={activeViewId}
      onChangeView={setActiveViewId}
      onCreate={() => navigate(`/content/${seed.slug}/create`)}
      filters={filters}
      onFiltersChange={setFilters}
      sortState={sortState}
      onSortChange={setSortState}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSubmitSearch={(q) => refetch({ search: q })}
    >
      <DataTable entries={entries} />
    </ContentToolbar>
  )
}
```

---

## Note implementative

- **Strumenti per vista**: `enabledTools` di `UserViewInstance` determina quali icone appaiono nella toolbar. I tool non presenti nell'array vengono omessi dal DOM (non solo nascosti).
- **Filter Pills**: le pill appaiono solo se `children` è presente (la sezione inferiore della toolbar) e se `Object.keys(filters).length > 0`. Una pill per colonna; ogni pill apre un dropdown con tutte le condizioni AND della colonna.
- **`generateConditionId`**: usa `Date.now()` + stringa casuale base-36. Sufficiente per unicità in sessione; non è un UUID persistente.
- **Focus campo ricerca**: gestito via `useEffect` su `isSearchOpen` per rispettare il ciclo di vita React (il DOM dell'input esiste solo dopo il render successivo alla transizione di stato).
- **Impostazioni vista (dropdown Settings)**:
  - Il bottone `settings` apre un `DropdownMenu` che contiene un campo di testo modificabile per il nome della vista e shortcut verso filtri/ordinamento.
  - Il nome della vista viene salvato tramite `onRenameView` quando premi `Enter`, quando il campo perde il focus o quando il menu viene chiuso, evitando salvataggi parziali durante la digitazione.
  - Durante l'input, i tasti singoli (es. `A`, `C`, `R` senza modifier) non propagano al `DropdownMenu`, così eventuali shortcut interni al menu non interferiscono con la scrittura del nome.

---

## TODO in sospeso

- **Persistenza viste**: `views`, `enabledTools` e la vista attiva devono provenire da una configurazione persistente per-utente, non da props statiche.
- **Flusso `onCreateView`**: la creazione/modifica/eliminazione di una vista utente non è ancora implementata; `onCreateView` è una callback stub.
- **Ricerca server-side**: `onSubmitSearch` deve essere collegato all'API `GET /api/content/:slug?search=...` con i parametri della vista attiva.
