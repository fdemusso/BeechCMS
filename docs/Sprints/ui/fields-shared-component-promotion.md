# Sprint Plan: Promozione del Modulo `fields` a Shared Component Library

> Feature source: `stages/00_ideation/output/feature_brief.md`
> Scope: `apps/dashboard` only. Zero changes to `@beechcms/core` and `apps/api`.

---

### Pre-Computation Analysis

Mapping eseguito via `graphify` CLI (graph AST, ~3k nodi). Comandi usati: `explain`, `affected --depth 2`, `path`.

**a) God Nodes identificati**

| Node | ID | Source | Degree | Ruolo |
|---|---|---|---|---|
| `FieldDisplay()` | `fields_fielddisplay_fielddisplay` | `features/fields/FieldDisplay.tsx:14` | 10 | Dispatcher di rendering read-only. Consumato da 3 slice diverse. |
| `FieldEdit()` | `fields_fieldedit_fieldedit` | `features/fields/FieldEdit.tsx:9` | 12 | Dispatcher di rendering editabile. Consumato da 3 slice diverse. |
| `RelationEdit()` / `RelationDisplay()` | `edit_relation_relationedit` | `features/fields/edit/relation.tsx:453`, `display/relation.tsx` | 6 | Renderer che rompe l'isolamento: uniche fonti dei cross-import verso `content-management` / `entry-editor`. |

`FieldDisplay`/`FieldEdit` sono God Nodes trasversali: sono il fan-in di rendering per l'intera dashboard ma vivono dentro una slice `features/`, contraddicendone la natura.

**b) Confini architetturali affetti**

- `@beechcms/core` (`packages/core`): **NON toccato.** `useSchema` continua a chiamare `registerSeeds`/`Seed` da core via `@/lib/api`. Nessuna interazione DB modificata.
- `apps/api`: **NON toccato.** Nessun endpoint, nessuna migrazione D1.
- `apps/dashboard`: **unico confine mutato.** Spostamento fisico `features/fields/` → `components/fields/` e inversione delle dipendenze verso 3 slice di business.

**c) `graphify affected` — impact analysis (breaking-change proof)**

`affected "fields_fielddisplay_fielddisplay" --depth 2` e `affected "fields_fieldedit_fieldedit" --depth 2` producono i consumatori esterni (slice di business) da aggiornare:

- `FieldDisplay` ← `content-kanban/kanban-card.tsx`, `content-gallery/gallery-peek-panel.tsx`, `lib/dynamic-columns.tsx`
- `FieldEdit` ← `entry-editor/renderer/layout-renderer.tsx`, `entry-editor/builder/column-card.tsx`, `bulk-edit/bulk-edit-dialog.tsx`, `pages/test-fields.tsx`

Grep di conferma (`from "@/features/fields"`) → **9 import di produzione + 14 file di test** da riscrivere su `@/components/fields`.

Dipendenze USCENTI illecite dal modulo `fields` (le sole vere violazioni VSA), da invertire via DI:

| File sorgente | Import illecito | Slice target |
|---|---|---|
| `edit/relation.tsx` L18–19 | `contentApi`, `CONTENT_QUERY_KEYS` | `content-management` |
| `display/relation.tsx` L9–10 | `contentApi`, `CONTENT_QUERY_KEYS` | `content-management` |
| `display/relation.tsx` L14 | `EntryEditorDialog` | `entry-editor` |
| `edit/richtext.tsx` L6 | `RichtextEditor` | `richtext-editor` |

`path "RelationDisplay" "contentApi"` → `RelationDisplay --contains-- relation.tsx --imports--> contentApi` (2 hop). Prova diretta del ciclo `content-* → fields → content-management`.

> **Discrepanza rilevata rispetto al brief (da correggere):** il brief modella solo `useSchemaHook` + `searchRelations`. La mappatura reale mostra che i renderer usano anche `contentApi.fetchById` (non solo `fetchList`) e **due componenti di altre slice** (`EntryEditorDialog`, `RichtextEditor`) mai citati. Il brief è quindi incompleto: il `FieldsContext` deve iniettare anche `fetchById` e due component-slot. `useSchema` proviene da `@/features/shared` (libreria condivisa, non slice di business) → resta un import lecito, NON va iniettato (YAGNI).

---

### VETO Audit

Valutazione dei confini proposti contro `ponytail_arch.md`.

**Invariante Botanico (bypass `@beech/core`):** RISPETTATO. Il refactoring è puramente client-side/presentazionale. Nessuna query D1, nessun field-name hardcoded, nessun bypass di `apiToDb`/`dbToApi`. `useSchema` continua a passare da `@beechcms/core` (`registerSeeds`/`Seed`). ✅

**VSA — cross-feature imports:** RISPETTATO dopo il refactoring. Stato attuale = VIOLAZIONE (4 import cross-slice da `fields` verso `content-management`/`entry-editor`/`richtext-editor`; God Node importato da altre slice). La regola Ponytail impone: *"If two slices need the same logic, mandate moving it to shared libs."* → esattamente ciò che facciamo promuovendo `fields` a `components/fields`. Le dipendenze verso business-slice vengono **invertite** (DI via Context), quindi `components/` non importa più da `features/`. Zero cross-import residui. ✅

**Cloudflare Purity:** N/A — nessun Worker/D1/R2, nessun ORM, nessun job stateful. ✅

**YAGNI (rischio over-engineering):** il Context è giustificato — senza inversione, un layer condiviso (`components/`) dipenderebbe da 3 slice di business, un ciclo di layering peggiore di quello attuale. Non si introducono astrazioni speculative: il `FieldsContext` espone **solo** le 4 dipendenze realmente consumate (`useSchema` escluso perché già shared). Il provider vive una sola volta nel composition root. ✅

**Aggiustamento imposto in questa fase:** l'interfaccia `FieldsContextType` del brief è estesa per coprire `fetchById` e i due component-slot, altrimenti il refactoring non compila. Nessun altro allargamento di scope.

Esito: **APPROVATO con correzione dell'interfaccia.** Procedo al drafting.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Il modulo `fields` è oggi un God Node trasversale (`FieldDisplay`/`FieldEdit`, degree 10–12) incastrato dentro `apps/dashboard/src/features/`. Questo produce due violazioni strutturali VSA:

1. **Fan-in illecito:** 3 slice di business (`content-kanban`, `content-gallery`, `entry-editor`, più `bulk-edit`) importano direttamente da `@/features/fields`. Una slice non deve importare da un'altra slice.
2. **Fan-out illecito + ciclo:** i renderer `relation.tsx` (edit+display) e `richtext.tsx` importano da `content-management`, `entry-editor` e `richtext-editor`, chiudendo il ciclo `content-list → content-kanban → fields → content-management → content-list` (provato via `graphify path`, 2 hop).

Deve essere costruito **prima di qualsiasi altra feature** perché finché `fields` resta una slice ogni nuova view che renderizza campi eredita e propaga la violazione. Promuovere `fields` a shared component library con inversione delle dipendenze (DI runtime via React Context) è la precondizione architetturale che sblocca l'isolamento pulito delle slice. Rispetta l'invariante Botanico (nessun bypass core, cambiamento solo presentazionale) e la regola Ponytail "logica condivisa → shared lib".

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Posizione attuale:** `apps/dashboard/src/features/fields/` (32 file: `FieldDisplay.tsx`, `FieldEdit.tsx`, `registry.ts`, `field-registry.ts`, `types.ts`, `default.tsx`, `index.ts`, cartelle `display/` e `edit/`).

**Barrel export** (`features/fields/index.ts`): `FieldDisplay`, `FieldEdit`, `FieldDisplayProps`, `FieldEditProps`, `getDisplayComponent`, `getEditComponent`, `BranchItemRow`, `AUTOMATION_RESERVED`, `BranchItemRowProps`.

**Alias risoluzione:** `apps/dashboard/tsconfig.json` + `tsconfig.app.json` definiscono SOLO `"@/*": ["./src/*"]`. Quindi `@/components/fields` risolve nativamente a `src/components/fields` — **nessuna modifica al tsconfig o al bundler necessaria.**

**Consumatori esterni di produzione (9):**
- `features/content-kanban/kanban-card.tsx:3` → `@/features/fields/FieldDisplay`
- `features/content-gallery/gallery-components/gallery-peek-panel.tsx:9` → `@/features/fields`
- `lib/dynamic-columns.tsx:20` → `@/features/fields`
- `features/entry-editor/renderer/layout-renderer.tsx:12` → `@/features/fields`
- `features/entry-editor/builder/column-card.tsx:28` → `@/features/fields`
- `features/bulk-edit/bulk-edit-dialog.tsx:26` → `@/features/fields`
- `pages/test-fields.tsx:7` → `@/features/fields/FieldEdit`

**File di test che importano da `@/features/fields/...` (14):** tutti sotto `src/test/fields/`, `src/test/features/content-list-relation.test.tsx`, `src/test/field-registry.test.ts`.

**Dipendenze uscenti illecite (da invertire):**
| File | Simboli | Origine |
|---|---|---|
| `edit/relation.tsx` L17–19 | `useSchema` / `contentApi` (`fetchById`,`fetchList`) / `CONTENT_QUERY_KEYS` (`detail`,`lists`) | `shared` / `content-management` |
| `display/relation.tsx` L8–14 | `useSchema` / `contentApi` / `CONTENT_QUERY_KEYS` / `EntryEditorDialog` | `shared` / `content-management` / `entry-editor` |
| `edit/richtext.tsx` L6 | `RichtextEditor` | `richtext-editor` |

**Composition root:**
- `main.tsx` monta `QueryClientProvider > WidgetSdkProvider > ThemeProvider > TooltipProvider > <App/>`.
- `App.tsx:216` ritorna `<AuthProvider><RouterProvider router={router} /></AuthProvider>` (router = `createBrowserRouter([...])` a L98).

**Firme reali (per interfaccia corretta):**
- `useSchema()` → nessun argomento; ritorna `UseQueryResult<Seed[]>`. (`shared/hooks/use-schema.ts:10`). `useActiveSeed(slug)` esiste già come helper.
- `contentApi.fetchList(slug, params)` e `contentApi.fetchById(slug, id)` (`content-management/api/content.api.ts:67`).
- `CONTENT_QUERY_KEYS.detail(slug,id)`, `.lists()` (`content-management/consts/content.keys.ts`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Nuovi file (`apps/dashboard/src/components/fields/`):**
1. `context.tsx` — `FieldsContext`, `FieldsProvider`, `useFieldsConfig()`, tipo `FieldsContextType`.
2. Intero contenuto di `features/fields/**` **spostato** (git mv) in `components/fields/**` (preserva la history e la struttura `display/` `edit/`).

**File modificati:**
3. `components/fields/edit/relation.tsx` — rimuove import `content-management`; consuma `useFieldsConfig()`.
4. `components/fields/display/relation.tsx` — rimuove import `content-management` + `entry-editor`; consuma `useFieldsConfig()` (incl. slot `EntryEditorDialog`).
5. `components/fields/edit/richtext.tsx` — rimuove import `richtext-editor`; consuma slot `RichtextEditor` dal context.
6. `App.tsx` — wrappa il router con `<FieldsProvider value={…}>` iniettando le API reali.
7. **9 file consumatori di produzione** — reindirizzati `@/features/fields*` → `@/components/fields*`.
8. **14 file di test** — reindirizzati + wrappati in `<FieldsProvider>` (o mock del context).

**File eliminati:** `apps/dashboard/src/features/fields/` (directory intera dopo il move).

> Nota di scope: questo sprint produce **struttura + inversione delle dipendenze**. NON riscrive la logica di rendering dei singoli campi (boolean/date/number/…): quei file vengono spostati as-is, solo i 3 renderer accoppiati vengono modificati.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Nessuna migrazione D1 in questo sprint (feature client-only).

**Task 4.1 — Creare il contesto `components/fields/context.tsx`**

Interfaccia corretta rispetto al brief (aggiunge `fetchById` e i due component-slot; usa i tipi reali di `@beechcms/core` e `content-management`):

```typescript
// SPDX-License-Identifier: BUSL-1.1
import * as React from "react"
import type { Seed } from "@beechcms/core"
import type { UseQueryResult } from "@tanstack/react-query"

/** Record generico di un content entry restituito dall'API list/detail. */
export type FieldRelationRecord = Record<string, unknown> & { id: string }

export interface FieldsContextType {
  /** Hook schema/seed condiviso (proxy di useSchema). Nessun argomento. */
  useSchema: () => UseQueryResult<Seed[]>
  /** Fetch di una singola entry per la risoluzione display della relazione. */
  fetchById: (slug: string, id: string) => Promise<FieldRelationRecord>
  /** Ricerca lista per il selettore di relazioni (search server-side). */
  searchRelations: (
    slug: string,
    params: { search?: string; limit?: number },
  ) => Promise<FieldRelationRecord[]>
  /** Factory delle query-key TanStack, iniettata per coerenza di cache. */
  queryKeys: {
    detail: (slug: string, id: string) => readonly unknown[]
    lists: () => readonly unknown[]
  }
  /** Component-slot iniettati da slice di business (evita import diretto). */
  components: {
    EntryEditorDialog: React.ComponentType<any>
    RichtextEditor: React.ComponentType<any>
  }
}

export const FieldsContext = React.createContext<FieldsContextType | null>(null)

export function FieldsProvider({
  value,
  children,
}: {
  value: FieldsContextType
  children: React.ReactNode
}) {
  return <FieldsContext.Provider value={value}>{children}</FieldsContext.Provider>
}

export function useFieldsConfig(): FieldsContextType {
  const ctx = React.useContext(FieldsContext)
  if (!ctx) {
    throw new Error("useFieldsConfig must be used within a FieldsProvider")
  }
  return ctx
}
```

**Task 4.2 — `git mv` del modulo** (preserva history):

```bash
git mv apps/dashboard/src/features/fields apps/dashboard/src/components/fields
```

**Task 4.3 — Rifattorizzare `components/fields/edit/relation.tsx`**
- Rimuovere L17–19 (`useSchema`, `contentApi`, `CONTENT_QUERY_KEYS`).
- In cima al componente: `const { useSchema, fetchById, searchRelations, queryKeys } = useFieldsConfig()`.
- Sostituire i siti d'uso:
  - L62–63 → `queryKey: queryKeys.detail(targetSlug, targetId)`, `queryFn: () => fetchById(targetSlug, targetId)`.
  - L145–147 / L332–334 → `queryKey: [...queryKeys.lists(), targetSlug, "relation-search", debouncedSearch]`, `queryFn: () => searchRelations(targetSlug!, { search: debouncedSearch })`.
  - `useSchema()` (L140, L311) invariato nella chiamata (ora dal context).

**Task 4.4 — Rifattorizzare `components/fields/display/relation.tsx`**
- Rimuovere L8–10 + L14 (`EntryEditorDialog`).
- `const { useSchema, fetchById, queryKeys, components } = useFieldsConfig()`.
- L180 `<EntryEditorDialog …>` → `<components.EntryEditorDialog …>`.
- Query keys/fetch come Task 4.3.

**Task 4.5 — Rifattorizzare `components/fields/edit/richtext.tsx`**
- Rimuovere L6 (`RichtextEditor`).
- `const { components } = useFieldsConfig()` → usare `<components.RichtextEditor …>`.

**Task 4.6 — Iniettare il provider nel composition root (`App.tsx`)**

```typescript
import { FieldsProvider } from "@/components/fields/context"
import { useSchema } from "@/features/shared"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import { EntryEditorDialog } from "@/features/entry-editor"
import { RichtextEditor } from "@/features/richtext-editor"

const fieldsConfig = {
  useSchema,
  fetchById: (slug: string, id: string) => contentApi.fetchById(slug, id),
  searchRelations: (slug: string, params: { search?: string; limit?: number }) =>
    contentApi.fetchList(slug, params).then((r) => r.items),
  queryKeys: {
    detail: CONTENT_QUERY_KEYS.detail,
    lists: CONTENT_QUERY_KEYS.lists,
  },
  components: { EntryEditorDialog, RichtextEditor },
}

// dentro App():
return (
  <AuthProvider>
    <FieldsProvider value={fieldsConfig}>
      <RouterProvider router={router} />
    </FieldsProvider>
  </AuthProvider>
)
```
> Verificare la forma esatta di ritorno di `contentApi.fetchList` (`.items` vs `.data`) leggendo `content.api.ts:67` prima di finalizzare `.then`.

**Task 4.7 — Reindirizzare i 9 consumatori di produzione**
Sostituzione meccanica `@/features/fields` → `@/components/fields` (e `@/features/fields/FieldDisplay` → `@/components/fields/FieldDisplay`, idem `FieldEdit`) nei file elencati in Section 2.

**Task 4.8 — Reindirizzare + wrappare i 14 test**
Aggiornare i path import e, per i test che montano `RelationEdit`/`RelationDisplay`/`RichtextEdit`, avvolgere in `<FieldsProvider value={mockFieldsConfig}>` con mock leggeri (nessun client API reale). Questo è il beneficio dichiarato dal brief: test isolati sul solo Context.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Eseguire dalla root del monorepo:

```bash
# 1. Type-check dashboard (rileva import rotti e mismatch del context)
pnpm --filter @beechcms/dashboard exec tsc --noEmit

# 2. Nessun residuo del vecchio path (deve restituire 0 righe)
grep -rn "@/features/fields" apps/dashboard/src

# 3. Nessun cross-import residuo dentro il modulo promosso (deve restituire 0 righe)
grep -rnE "@/features/(content-management|entry-editor|richtext-editor)" apps/dashboard/src/components/fields

# 4. Test suite dashboard
pnpm --filter @beechcms/dashboard test

# 5. Build completa workspace
pnpm build

# 6. (Opzionale) Rigenerare il grafo e verificare assenza di cicli
graphify update . --force
graphify path "RelationDisplay" "contentApi"   # deve restituire: no path
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `apps/dashboard/src/features/fields/` non esiste più; tutto il modulo vive in `apps/dashboard/src/components/fields/`.
- [ ] `git log --follow` sui file spostati mostra history preservata (usato `git mv`).
- [ ] `components/fields/context.tsx` esporta `FieldsContext`, `FieldsProvider`, `useFieldsConfig`, `FieldsContextType`.
- [ ] `FieldsContextType` copre `useSchema`, `fetchById`, `searchRelations`, `queryKeys`, `components` — tipizzato senza `any` sui campi dati (i `components` slot possono restare `ComponentType<any>`).
- [ ] `grep -rn "@/features/fields" apps/dashboard/src` → 0 risultati.
- [ ] `grep -rnE "@/features/(content-management|entry-editor|richtext-editor)" apps/dashboard/src/components/fields` → 0 risultati.
- [ ] `edit/relation.tsx`, `display/relation.tsx`, `edit/richtext.tsx` consumano esclusivamente `useFieldsConfig()`.
- [ ] `App.tsx` monta `<FieldsProvider>` tra `AuthProvider` e `RouterProvider` con le API reali iniettate.
- [ ] `tsc --noEmit` sul dashboard → 0 errori.
- [ ] `pnpm --filter @beechcms/dashboard test` verde; i test di relation/richtext usano un `FieldsProvider` mock (nessun client API reale).
- [ ] `pnpm build` completa senza errori.
- [ ] `graphify path "RelationDisplay" "contentApi"` → nessun path (ciclo eliminato).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Nessuna modifica a `@beechcms/core` o `apps/api`** — zero endpoint, zero migrazioni D1.
- **Nessuna riscrittura della logica di rendering** dei field non accoppiati (boolean, date, number, media, json, text, repeater, select): si spostano as-is.
- **Nessun cambio di comportamento runtime** — refactoring puramente strutturale; UI e UX identiche.
- **Nessuna estensione dell'interfaccia oltre le 4 dipendenze reali** (`useSchema` incluso perché già consumato) — niente slot speculativi (YAGNI).
- **Nessuna modifica al `field-registry`/`registry` di dispatch** oltre lo spostamento di file.
- **Nessuna promozione a package condiviso** (`packages/*`): `fields` resta interno a `apps/dashboard/src/components/`, non diventa un pacchetto pubblicabile.
- **Nessun refactor dei query-key di `content-management`**: vengono iniettati as-is, non ridisegnati.
