# Sprint Plan — `TagChoiceViews`

Serie: ROADMAP §4 (`stages/01_sprint_planning/output/backlog/ROADMAP.md`). Sprint 1 `TagOptionsContract`, Sprint 2
`SchemaPlanDefinitionDiff` e Sprint 3 `TagChoiceEditing` sono **DONE** (review PASS, archivi in `docs/Sprints/`).
Brief: `stages/00_ideation/output/feature_brief.md` — regola §2.10 (kanban/ordinamento/raggruppamento solo sui tag
non multipli; config di vista su un tag multiplo = errore di validazione), §4 "Ordinamento, raggruppamento, kanban"
(ordine = ordine opzioni; senza opzioni = alfabetico; "Senza valore" solo se non obbligatorio; parità funzionale di
filtri, formattazione condizionale, automazioni).

### Pre-Computation Analysis

Grafo: `graphify-out/` aggiornato 2026-10-13 14:28 (dopo l'esecuzione dello Sprint 3, review PASS). Comandi usati:
`explain`, `affected --depth 2`, `path`. Il grafo non traccia gli import cross-package via `@beechcms/core`
(`affected resolveKanbanColumns` riporta solo il test core): i consumatori dashboard/API sono stati verificati con
`grep` sui simboli esatti (vedi c).

**a) God Nodes**
- `generateColumns()` (`apps/dashboard/src/lib/dynamic-columns.tsx:L149`) — degree 31; definisce per ogni branch
  sortabilità e valore di raggruppamento della tabella.
- `buildSelectQuery()` (`packages/core/src/engine/query/query.ts:L97`) — degree 16; unico punto SQL per lista
  dashboard, Public API, relazioni, automazioni (`findMany`).
- `buildFilterableColumns()` (`apps/dashboard/src/lib/filter-dsl.ts:L35`) — 22 nodi impattati: decide il tipo dei
  filtri toolbar **e** delle regole di formattazione condizionale (`view-config-mapping.ts:L100`).
- `ContentKanban()` (`features/content-kanban/components/content-kanban.tsx:L172`) — degree 10; prefill colonna e
  update ottimistico.
- `evaluateWhen()` (`apps/api/src/features/automations/filters/when-evaluator.ts:L9`) — runner eventi + cron.

**b) Confini architetturali**
- `@beechcms/core`:
  - `dashboard-layout/kanban/kanban.ts` — candidati asse, colonne (+ colore), body di move, nuovo
    `kanbanColumnEntryValue`.
  - `dashboard-layout/content-view.ts` — nuovo `viewConfigChoiceIssues`; pulizia in lettura estesa.
  - `engine/query/query.ts` — `ORDER BY` per tag singoli; filtri `tags` con semantica di appartenenza.
- `apps/api`:
  - `features/content/handlers/kanban-move.ts`, `features/content/handlers/views.ts` (stesso slice `content`).
  - `features/automations/filters/when-evaluator.ts` (slice `automations`).
  - Nessuna nuova rotta, nessuna nuova permission, nessun middleware toccato.
- `apps/dashboard`:
  - shared: `lib/tags-utils.ts`, `lib/filter-dsl.ts`, `lib/dynamic-columns.tsx`, `lib/dynamic-columns-lengths.ts`.
  - slice: `features/content-toolbar` (`shared.ts`, `toolbar-hooks/use-toolbar-sort.ts`),
    `features/content-management` (`hooks/use-content-list-query.ts`, `hooks/use-content-table-config.ts`,
    `components/content-table-renderer.tsx`), `features/content-kanban` (`components/content-kanban.tsx`,
    `components/kanban-column.tsx`, `utils/use-kanban-drag.ts`), `features/content-gallery`
    (`group-by-category.ts`, `gallery-hooks/use-content-gallery.ts`, `folder-create-defaults.ts`).
  - Ogni slice importa solo da `@beechcms/core` e `@/lib`; nessun import nuovo fra slice.

**c) `graphify affected` (depth 2) + grep consumatori**
- `resolveKanbanConfig` → `cleanKanban` (content-view.ts:L240), `validateViewConfigAgainstSeed` (L285),
  `content-view.repository.ts`, `kanban.test.ts`, `content-view.test.ts`, re-export `core/src/index.ts:L101`.
  Grep: `kanban-move.ts:L39`, `list.ts:L146` (`kanbanAxis`), `kanban-settings-section.tsx:L24`.
  → Firma invariata; cambia l'insieme dei candidati (solo tag singoli con opzioni).
- `resolveKanbanColumns` → `kanban.test.ts`. Grep: `use-kanban-columns.ts:L13`, `use-kanban-entry-sync.ts:L22`,
  `kanban-settings-section.tsx:L27` — tutti chiamano con un solo argomento → rimuovere `distinctTagValues` non
  rompe nessun chiamante.
- `KanbanMoveBody` (grep): `kanban-move.ts:L9`, `use-kanban-drag.ts:L277-284`, `kanban-move.test.ts`. → **Rottura
  voluta** del body (`axis.kind` sparisce): tutti e tre cambiano in questo sprint.
- `validateViewConfigAgainstSeed` → `projectContentView` (L304), `projectContentViews` (L311),
  `content-view.test.ts`; grep: `views.ts:L97, L128`.
- `buildFilterCondition` → `buildSelectQuery` (L151), `findUnappliedFilters` (L224), `query.test.ts`. I filtri
  `tags` arrivano da: toolbar (`use-content-list-query.ts` → `list.ts:L127` `toEngineFilters`), pushdown cron
  (`when-pushdown.ts:L53` → `filter-translation.ts:L35`), `set-variable.executor.ts:L60`, `seed-lookup.ts:L78`,
  Public API (`public/query/query-builder.ts:L153` mappa `tags` → `'tags'`). → Un solo cambiamento core sistema
  tutti i percorsi.
- `buildFilterableColumns` → `useContentListQuery` (L186), `useToolbarFilters` (L42), `toViewToolbarState`
  (view-config-mapping.ts:L108), `ContentViewWorkspace`, `useContentToolbar`, conditional-formats editor/hook, test
  `use-toolbar-filters.test.ts`, `view-config-mapping.test.ts`.
- `getGroupableColumns` → `useToolbarGroupBy` (L33), `useContentToolbar` (L154), `settings-menu.tsx`, test
  `shared.test.ts`, `toolbar-hooks.test.ts`.
- `evaluateWhen` → `automation-runner.ts:L44`, `cron-runner.ts:L77, L109`, test unit + integration
  (`seed-scoped-refs`, `cron-runner`).
- `kanbanMoveHandler` → `content/index.ts:L28`, `kanban-move.test.ts`.
- `path "KanbanSettingsSection" "useToolbarGroupBy"` → nessun percorso: asse kanban e "Raggruppa per" della
  tabella/gallery sono due sorgenti indipendenti (vanno corrette entrambe).

Scoperte che cambiano il perimetro rispetto alla voce di roadmap:
1. **Asse senza opzioni.** `resolveKanbanColumns` è chiamato ovunque senza `distinctTagValues`: un `tags` senza
   opzioni produce solo la colonna "Senza valore". Il brief chiede "una colonna per ogni opzione" → asse = tag
   singolo **con** opzioni; il parametro morto sparisce.
2. **Scritture kanban con stringa nuda.** Oltre allo swap di `kanban-move.ts:L65-70`, il prefill "nuova voce in
   colonna" (`content-kanban.tsx:L310`) e l'update ottimistico (`content-kanban.tsx:L79, L118-120`) scrivono
   `col.value` (stringa) su un `tags` → create 400 / chip resi come testo muto. Serve una sola funzione core che
   traduce valore colonna → valore entry.
3. **Filtri `tags` rotti a livello SQL.** `buildFilterCondition` (`query.ts:L337-353`) tratta `eq` come `col = ?` e
   `contains` come `LIKE` sul testo JSON: `["pro"] = 'pro'` è sempre falso. Rompe il filtro toolbar, il pushdown
   delle automazioni cron (`PUSHDOWN_OPS` include `eq`/`neq`/`contains`), `set_variable` e `seed-lookup`.
4. **Toolbar cieca sui `tags`.** `buildFilterableColumns` (`filter-dsl.ts:L49`) riconosce come "tags" solo i `json`
   con alias contenente `tag`: un vero branch `tags` diventa filtro "text" e le regole di formattazione condizionale
   confrontano stringhe con array (mai vere). Idem `use-content-list-query.ts:L144` (valori disponibili).
5. **Gallery.** Le cartelle (`groupByCategory`) sono in ordine alfabetico e il prefill della cartella aperta
   (`folder-create-defaults.ts:L33`) scrive una stringa su un `tags` → create 400.
6. **`automation-value-input.tsx:L89-118`** offre già i valori opzione (ponte Sprint 1): nessuna modifica.

### VETO Audit

- **YAGNI.**
  - Nessun nuovo endpoint, nessuna nuova tabella, nessuna migrazione, nessun nuovo componente UI (il pallino colore
    della colonna è uno `span` nel header esistente).
  - Una sola funzione core nuova per le viste (`viewConfigChoiceIssues`) e una per il kanban
    (`kanbanColumnEntryValue`); due helper puri nella lib condivisa della dashboard (`compareTagChoice`,
    `tagFilterValues`).
  - La semantica array dei filtri vive in un solo punto (`buildFilterCondition`) invece di traduzioni sparse in
    `toEngineFilters` / `filter-translation`.
  - Nessun ordinamento/kanban sui tag multipli, nessuna capacità di filtro nuova (brief §5).
  - Le viste già salvate non vengono migrate: la proiezione in lettura le ripulisce, come già fa per i branch
    eliminati.
- **Botanical Invariant.** Nessun accesso D1 fuori da `@beechcms/core`: l'ordinamento per posizione opzione è SQL
  generato da `buildSelectQuery` con valori in binding; i filtri passano dallo stesso builder. Le regole di validità
  delle viste stanno in core (`viewConfigChoiceIssues`), gli handler le chiamano soltanto. I riferimenti delle viste
  restano Branch ID (`br_XX`); nessun alias hardcoded (si sceglie per `type`/`multiple`/`options`).
- **VSA.** API: modifiche dentro `features/content` e `features/automations`, nessun import fra i due. Dashboard:
  quattro slice toccati, ciascuno importa solo `@beechcms/core` e `@/lib/*`; la logica condivisa (confronto valori
  tag, valori filtro) va in `lib/tags-utils.ts`, non in uno slice.
- **Cloudflare purity.** Solo SQL deterministico in `SELECT` (nessun DDL, nessun job).
- **Esito:** approvato. HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Gli Sprint 1–3 hanno reso i `tags` con opzioni l'unico modello di scelta (dato sempre array, opzioni `{ value, color }`
vincolanti, editor e chip). Le viste però ragionano ancora come se il dato fosse uno scalare o come se i tag fossero
`json` con alias `tag`: l'asse kanban accetta tag multipli e liberi, lo spostamento fa uno swap che su un tag singolo
lascia due valori (422), il prefill di colonna/cartella scrive stringhe nude (400), l'ordinamento confronta il testo
JSON, i filtri `eq`/`contains` sui `tags` non trovano nulla in SQL, la toolbar non riconosce i branch `tags`, le
automazioni confrontano array con stringhe. È l'ultimo sprint della serie: dopo, `v0.x` può essere rilasciata
(invariante di rollout della ROADMAP).

- **VSA:** il comportamento condiviso (candidati asse, valore di colonna, validità della vista, SQL di ordinamento e
  filtro) nasce in `@beechcms/core`; API e dashboard lo consumano. Nessuno slice importa da un altro.
- **Botanical:** ogni lettura/scrittura continua a passare da `buildSelectQuery` / `validateAndSanitizeSeedPayload`;
  il server resta l'autorità (422 sulle viste, 400/422 sulle scritture).

Precondizione: il lavoro dello Sprint 3 (oggi interamente nel working tree di `feature/tag-choice-editing`, HEAD
`fe8aec25`) è committato. L'executor parte da un branch nuovo `feature/tag-choice-views` da quel commit.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Core — kanban (`packages/core/src/dashboard-layout/kanban/kanban.ts`)**
- `KanbanColumnDescriptor` `L21-25`: `{ value, label }`.
- `isAxisCandidate` `L51-60`: esclude `status`, localizzati, `NON_AXIS_TYPES`; accetta **qualsiasi** `tags` e
  `boolean`.
- `resolveKanbanConfig` `L68-81`: incompatibile con `allowDrafts` o senza candidati.
- `resolveKanbanColumns(branch, distinctTagValues = [])` `L90-109`: boolean `[false, true]`; tags = opzioni in
  ordine, altrimenti `distinctTagValues` alfabetici; colonna `null` "Senza {label}" in coda se non obbligatorio.
- `KanbanMoveBody` `L118-127`: `axis?: { kind: 'scalar'; value } | { kind: 'tags'; oldValue; newValue }`.
- `kanbanColumnFilter` `L129-141`: tags → `has_tag`, `null` → `is_empty`. Invariato.

**Core — viste (`packages/core/src/dashboard-layout/content-view.ts`)**
- `ContentViewConfig` `L142-157`: `sort { columnRef, desc }`, `groupBy { columnRef, datePrecision? }`,
  `kanban { axisBranchId, sort { branchId, dir } | null, hiddenColumnValues? }`; ref = `br_XX` o colonna di sistema.
- `cleanKanban` `L239-248`: azzera asse non candidato e sort su branch inesistente.
- `validateViewConfigAgainstSeed` `L255-294`: pulizia pura, mai errore (branch inesistenti, filtri duplicati,
  precisione data). Usato in scrittura (`views.ts:L97, L128`) e in lettura (`projectContentView` `L301-305`).

**Core — query (`packages/core/src/engine/query/query.ts`)**
- `columnSql` `L67-73`: alias nudo per branch non localizzati.
- `ORDER BY` `L189-197`: `kanbanOrder` vince; poi `orderBy` su colonna valida → `ORDER BY <col> <dir>`; default
  `created_at DESC`. Le bindings dell'`ORDER BY` precederebbero quelle di `LIMIT/OFFSET` (`L199-202`).
- `buildFilterCondition` `L277-361`: `is_empty` su `tags` = `NULL`/`'[]'`/`'{}'` (`L290-294`); `in`/`not_in`
  `L297-310` = `col IN (...)`; `has_tag`/`has_any_tag`/`has_all_tags` `L312-332` con `json_each`; `eq`/`neq`
  `L337-341` = `col = ?`; `contains` & co. `L343-352` = `LIKE`.
- `findUnappliedFilters` `L221-226`: un gruppo è "non applicato" se `buildFilterCondition` ritorna `null`.

**Core — tag (`engine/seeds/tag-options.ts`)**: `isSingleChoiceTags` `L11`, `tagOptionValues` `L16`,
`findTagOption` `L21`. Tipo `TagOption` in `engine/types.ts`.

**API (`apps/api/src`)**
- `features/content/index.ts:L28-34`: `PATCH /:slug/:id/kanban-move`, `GET|POST /:slug/views`,
  `PATCH /:slug/views/:viewId` — permission e middleware invariati.
- `handlers/kanban-move.ts`: parsing body `L28-37` (400 `content-invalid-body`), candidato asse `L39-43` (400
  `content-invalid-kanban-axis`), swap tags `L64-71`, validazione `L73-83` (422 `content-validation-error`),
  `updateWithKanbanPosition` `L86-94`.
- `handlers/views.ts`: `invalidView` `L46-48` (422 `content-invalid-view`), create `L76-104`, update `L106-135`.
- `handlers/list.ts:L125-141`: `sortBy` = alias, passato a `findMany` senza validazione (colonne sconosciute
  ignorate dal core).
- `features/automations/filters/when-evaluator.ts`: `compare` `L52-79`, `coerceEqual` `L81-87`; `isempty` solo
  `null`/`''`; `eq` su array sempre falso.
- `features/automations/filters/when-pushdown.ts:L8`: `PUSHDOWN_OPS` = `eq`, `neq`, `contains`, `gt`, `lt`,
  `isempty`, `isnotempty` → `conditionToFilterGroup` (`filter-translation.ts:L35`, tipo `tags` per i branch tags).

**Dashboard (`apps/dashboard/src`)**
- `lib/tags-utils.ts`: `parseTagsValue` `L7`, `extractTagNames` `L28`, `resolveTagChips` `L36`.
- `lib/filter-dsl.ts:L44-52`: `buildFilterableColumns` — `json` con alias `tag` → `"tags"`; branch `tags` → `"text"`.
- `lib/dynamic-columns.tsx:L131-188`: colonna per branch, sortabile di default; grouping: `date` con
  `getGroupingValue`, `boolean`/`number` aggregati, il resto `count` senza `getGroupingValue` (un array diventa un
  gruppo per riga).
- `lib/dynamic-columns-lengths.ts:L45-46`: euristica "alias contiene `tag`" sui `json`.
- `lib/conditional-format.ts:L100-108`: valore regola = `parseTagsValue` se `group.type === "tags"`; il tipo arriva da
  `buildFilterableColumns`.
- `features/content-toolbar/shared.ts:L195-232`: `getGroupableColumns` — status, boolean, date, text, number; **nessun
  `tags`**.
- `features/content-toolbar/toolbar-hooks/use-toolbar-sort.ts:L27-35`: sortabili = `text|number|date|tags` con
  `policies.sort`.
- `features/content-management/hooks/use-content-list-query.ts:L140-176`: valori filtro tag da `json` con alias `tag`
  + facets, alfabetici.
- `features/content-management/hooks/use-content-table-config.ts:L76-79`: `grouping = [groupBy]`;
  `components/content-table-renderer.tsx:L48`: `data={query.data}`. TanStack con `manualSorting` → gruppi
  nell'ordine di prima occorrenza.
- `features/content-kanban/utils/use-kanban-drag.ts:L280-284`: body `kind: 'tags'` con `oldValue/newValue`.
- `features/content-kanban/components/content-kanban.tsx`: update ottimistico `L74-81`, `L115-120`; props colonna
  `L156-168`; prefill `L309-311`.
- `features/content-kanban/components/kanban-column.tsx:L10-22` props, `L72` label nel header.
- `features/content-gallery/group-by-category.ts:L26-52` (alfabetico, "senza categoria" in coda);
  `gallery-hooks/use-content-gallery.ts:L46-50`; `folder-create-defaults.ts:L22-36`.
- `features/automations/components/automation-editor/automation-value-input.tsx:L89-118`: menu valori opzione
  (nessuna modifica).

**Fixture canonici (`packages/testing/src/seeds/canonical.seeds.ts:L27-55`)**: `posts` con `br_07 tags` (multiplo,
senza opzioni) e `br_11 priority` (`multiple: false`, opzioni `low #64748b`, `high #ef4444`, non obbligatorio);
`allowDrafts: true` e viste `table|gallery` → **non** kanban-compatibile (i test kanban usano
`{ ...posts, allowDrafts: false }`, idioma già in `kanban-settings-section.test.tsx:L32`). In core non si importano
i canonici (`content-view.test.ts:L19-20`): seed locale `ARTICLES` con `br_03 stage` singolo con opzioni.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Core**
- `packages/core/src/dashboard-layout/kanban/kanban.ts` — modifica (asse, colonne + colore, body, nuova funzione).
- `packages/core/src/dashboard-layout/content-view.ts` — modifica (`viewConfigChoiceIssues`, pulizia).
- `packages/core/src/engine/query/query.ts` — modifica (`ORDER BY` tag singoli, filtri `tags`).
- Test: `kanban/kanban.test.ts`, `content-view.test.ts`, `engine/query/query.test.ts` — modifica.

**API**
- `apps/api/src/features/content/handlers/kanban-move.ts` — modifica.
- `apps/api/src/features/content/handlers/views.ts` — modifica.
- `apps/api/src/features/automations/filters/when-evaluator.ts` — modifica.
- Test: `handlers/kanban-move.test.ts` (riscrittura), `test/integration/content-views.integration.test.ts`,
  `test/integration/content-tag-options.integration.test.ts`, `automations/filters/when-evaluator.test.ts` — modifica.

**Dashboard**
- `lib/tags-utils.ts`, `lib/filter-dsl.ts`, `lib/dynamic-columns.tsx`, `lib/dynamic-columns-lengths.ts` — modifica.
- `features/content-toolbar/shared.ts`, `features/content-toolbar/toolbar-hooks/use-toolbar-sort.ts` — modifica.
- `features/content-management/hooks/use-content-list-query.ts`, `hooks/use-content-table-config.ts`,
  `components/content-table-renderer.tsx` — modifica.
- `features/content-kanban/components/content-kanban.tsx`, `components/kanban-column.tsx`,
  `utils/use-kanban-drag.ts` — modifica.
- `features/content-gallery/group-by-category.ts`, `gallery-hooks/use-content-gallery.ts`,
  `folder-create-defaults.ts` — modifica.
- Test: `lib/tags-utils.test.ts`, `lib/filter-dsl.test.ts`, `lib/dynamic-columns.test.tsx`,
  `features/content-toolbar/test/unit/shared.test.ts`, `.../toolbar-hooks.test.ts`,
  `features/content-kanban/test/unit/kanban-settings-section.test.tsx`,
  `features/content-gallery/test/unit/group-by-category.test.ts`, `.../use-content-gallery.test.ts` — modifica;
  `features/content-gallery/test/unit/folder-create-defaults.test.ts`,
  `features/content-management/test/unit/use-content-table-config.test.ts` — nuovi.

**Docs**
- `CHANGELOG.md`, `docs/reference/internal-content.md`, `docs/reference/public-api.md`,
  `docs/build/schema-modeling.md` — modifica.

Nessun file in `packages/cli`, `packages/mcp`, `packages/client`, `packages/forms-react`, migrazioni, seed demo.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Core kanban: asse, colonne, body di move, valore di colonna

File: `packages/core/src/dashboard-layout/kanban/kanban.ts`. Approccio: la regola "quale `tags` è un asse" e "che
valore scrive una colonna" vivono qui, una volta; API e dashboard le chiamano (oggi sono tre copie divergenti).

Building blocks (verbatim):

```ts
/** A single column on the board, in deterministic display order (Q2). */
export interface KanbanColumnDescriptor {
  /** The discrete axis value. `null` ⇒ the always-last "Senza valore" column. */
  value: string | null
  label: string
  /** The option color (#RRGGBB) of a tags-axis column. Absent on boolean columns and on the null column. */
  color?: string
}

export function resolveKanbanColumns(branch: Branch): KanbanColumnDescriptor[]

/** Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 *  AND the position upsert atomically (KB-S04e). */
export interface KanbanMoveBody {
  /** Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch. */
  axisBranchId: string
  /** New fractional-index key for this entry in the destination column (KB-S04b/d). */
  position: string
  /** Present only on a cross-column move: the destination column value (`null` = "Senza valore"). */
  axis?: { value: string | null }
}

/**
 * The entry value that puts an entry in the kanban column `columnValue` of `branch`:
 * boolean → `true`/`false` (`null` column → `null`), tags → `[columnValue]` (`null` column → `[]`),
 * any other type → `columnValue` unchanged. Pure.
 */
export function kanbanColumnEntryValue(
  branch: Branch,
  columnValue: string | null,
): boolean | string | string[] | null
```

Regole:
- `isAxisCandidate` `L51-60`: un `tags` è candidato solo se `isSingleChoiceTags(b)` **e**
  `tagOptionValues(b).length > 0` (import da `../../engine/seeds/tag-options.js`, già importato `tagOptionValues`
  `L6`). Esclusioni esistenti (status, localizzati, `NON_AXIS_TYPES`) invariate; boolean invariato.
- `resolveKanbanColumns`: parametro `distinctTagValues` rimosso, ramo alfabetico rimosso. Colonne tags = opzioni
  in ordine dichiarato, `label = value`, `color = option.color`. Boolean e colonna `null` senza `color`. Regola
  "Senza {label}" solo se non obbligatorio invariata. Aggiornare il JSDoc (`@param distinctTagValues` sparisce).
- `kanbanColumnEntryValue`: per boolean `'true'` → `true`, qualsiasi altra stringa → `false`.
- `KanbanAxisBranchType` resta `'tags' | 'boolean'`.

Test (`packages/core/src/dashboard-layout/kanban/kanban.test.ts`, unit, seed inline esistenti — core non importa i
canonici):
- Sostituire "accepts tags branch as candidate" con: `it('accepts a single-choice tags branch with options as candidate')`
  → `compatible: true`, `type: 'tags'`.
- `it('rejects a multiple-choice tags branch as axis candidate')` → `no-candidate-branch`.
- `it('rejects a single-choice tags branch without options as axis candidate')` → `no-candidate-branch`.
- Eliminare "tags axis without options: sorts distinctTagValues alphabetically" (parametro rimosso); aggiornare le
  chiamate con secondo argomento (`L120`).
- `it('tags axis columns carry the option color in declared order and the null column has none')`.
- `describe('kanbanColumnEntryValue')`: matrice (Rule 1.6) — tags `'high'` → `['high']`, tags `null` → `[]`, boolean
  `'true'` → `true`, boolean `'false'` → `false`, boolean `null` → `null`.

### Task 2 — Core viste: validità dell'asse di scelta

File: `packages/core/src/dashboard-layout/content-view.ts`. Approccio: funzione pura separata dalla pulizia, perché
la pulizia per contratto non fallisce mai (`L250-253`) mentre il brief §2.10 vuole un errore in scrittura.

```ts
/**
 * Brief §2.10: `sort`, `groupBy` and `kanban.sort` may reference a `tags` branch only when it is single choice;
 * `kanban.axisBranchId` may reference a `tags` branch only when it is a kanban axis candidate.
 * One message per offending reference, in the order sort, groupBy, kanban axis, kanban sort; `[]` when valid.
 * References to missing branches and to non-`tags` branches are not issues (cleanup handles them). Pure.
 */
export function viewConfigChoiceIssues(config: ContentViewConfig, seed: Seed): string[]
```

Regole:
- Branch risolto con `findBranchById` (già importato `L6`); colonne di sistema mai issue.
- Messaggi in inglese, citano l'alias e il motivo ("'tags' is a multiple-choice tags field: sort needs
  multiple: false"; per l'asse kanban senza opzioni: "... kanban axis needs a single-choice tags field with
  options"). Il testo non è contratto (Rule 5.4).
- `validateViewConfigAgainstSeed` (pulizia in lettura, `L267-272` e `cleanKanban` `L239-248`): azzera anche `sort`,
  `groupBy` e `kanban.sort` che referenziano un `tags` non singolo (stessa politica dei branch eliminati: una vista
  salvata prima di un cambio di `multiple` non deve far ordinare/raggruppare per un tag multiplo). L'asse è già
  azzerato da `cleanKanban` perché non è più candidato.
- Export automatico via `core/src/index.ts:L101` (`export *`).

Test (`packages/core/src/dashboard-layout/content-view.test.ts`, unit). Fixture: aggiungere a `ARTICLES` (`L21-29`)
`{ id: 'br_05', alias: 'labels', label: 'Labels', type: 'tags' }` (multiplo, senza opzioni) e
`{ id: 'br_06', alias: 'topic', label: 'Topic', type: 'tags', multiple: false }` (singolo libero); aggiornare il
commento `L19-20` ("the branch types the cleanup rules distinguish" ora include le modalità tags). Nuovo
`describe('viewConfigChoiceIssues')`:
- `it('returns no issues for sort, groupBy and kanban axis on a single-choice tags branch with options')`.
- `it('reports sort and groupBy on a multiple-choice tags branch, one issue each')` → length 2.
- `it('reports a kanban axis on a single-choice tags branch without options')` → length 1.
- `it('reports a kanban card sort on a multiple-choice tags branch')` → length 1.
- `it('ignores references to missing branches and to non-tags branches')` → `[]`.
In `describe('validateViewConfigAgainstSeed')`:
- `it('drops sort and groupBy that reference a multiple-choice tags branch')`.
- `it('keeps sort and groupBy on a free single-choice tags branch')`.

### Task 3 — Core query: ordinamento per opzione e filtri `tags` come appartenenza

File: `packages/core/src/engine/query/query.ts`. Approccio: SQL generato nel builder, valori in binding; un solo
punto per tutte le sorgenti di filtro (toolbar, Public API, automazioni).

**Ordinamento** (`L191-195`, ramo `orderBy`):
- Branch `tags` **multiplo** (`type === 'tags' && !isSingleChoiceTags`) → `orderBy` ignorato come una colonna non
  valida (cade su `created_at DESC`). Motivo: brief §2.10 / §5 "ordinamento per primo elemento scartato".
- Branch `tags` singolo: espressione testa `H = (CASE WHEN json_valid(<col>) THEN json_extract(<col>, '$[0]') END)`
  (`json_valid` protegge da testo non JSON, come `localizedColumnSql` `L59-61`). Clausola:
  `ORDER BY (H IS NULL) ASC, <rank> <dir>` dove
  - con opzioni: `<rank>` = `CASE H WHEN ? THEN 0 WHEN ? THEN 1 … ELSE <n> END` con le `n` opzioni in binding nell'
    ordine dichiarato (un valore obsoleto ha rango `n`, dopo ogni opzione);
  - senza opzioni: `<rank>` = `H` (alfabetico SQLite).
  Vuoti (`NULL`, `[]`) sempre in coda in entrambe le direzioni, come `kanbanOrderClause` `L109`.
- Le bindings dell'`ORDER BY` vanno spinte dopo quelle del `WHERE` e prima di `LIMIT/OFFSET` (l'ordine testuale
  della SQL già lo garantisce: pushare nel ramo `orderBy`). In `isCount` nessun `ORDER BY` → nessuna binding.
- Helper privato nel file (es. `tagsOrderSql(col, branch, dir, bindings)`); nessun nuovo export.

**Filtri** (`buildFilterCondition`): quando `type === 'tags'`, prima dei rami `in`/`eq`/`contains`:
- `eq`, `contains` → stessa clausola di `has_tag` (`L324-327`); `in` → `has_any_tag`; `neq`, `not_contains` →
  `NOT (<clausola has_tag>)`; `not_in` → `NOT (<clausola has_any_tag>)`.
- Valore scalare non stringa/numero o `null` → `null` (gruppo non applicato, coerente con `findUnappliedFilters`);
  `in` con array vuoto → `'0'`, `not_in` vuoto → `null` (stessa regola `L304-306`). Valori convertiti con `String()`.
- `is_empty`/`is_not_empty`, `has_*`, `starts_with`/`ends_with` e tutti i tipi diversi da `tags` invariati (il tipo
  `json` mantiene il comportamento attuale).
- Effetto: `json_each(NULL)` non produce righe → `neq` su una entry vuota è vero (stessa semantica in memoria del
  Task 6).

Test (`packages/core/src/engine/query/query.test.ts`, unit, `mockSeed` del file; aggiungere a `mockSeed` un
branch `tags` singolo con due opzioni e uno multiplo se mancanti):
- `it('orders a single-choice tags branch by option position with empty values last')` → SQL contiene
  `CASE` + `(… IS NULL) ASC`; bindings = opzioni in ordine prima di `limit, offset`.
- `it('orders a free single-choice tags branch by its first value with empty values last')`.
- `it('ignores orderBy on a multiple-choice tags branch and falls back to created_at DESC')`.
- `it('turns eq and contains on a tags column into membership')` → contiene `json_each`, non contiene `tags = ?`
  né `LIKE`.
- `it('turns neq and not_in on a tags column into negated membership')`.
- `it('lists a tags eq condition with a null value as unapplied')` (`findUnappliedFilters`).
- Il test esistente "handles tags conditions" (`L266`) resta invariato.

### Task 4 — API: `kanban-move`

File: `apps/api/src/features/content/handlers/kanban-move.ts`.
- Parsing (`L28-37`): oltre ai controlli esistenti, se `axis` è presente deve essere un oggetto con `value` stringa o
  `null`; altrimenti 400 `content-invalid-body` (detail esteso: "axis.value must be a string or null"). Il vecchio
  body `{ kind: 'tags', oldValue, newValue }` cade qui.
- Patch (`L57-71`): `patch = { [axisBranch.alias]: kanbanColumnEntryValue(axisBranch, body.axis.value) }` per ogni
  tipo di asse; swap e lettura di `current[alias]` spariscono. `current` resta per 404 e `ifMatch`.
- Validazione `L73-83` invariata: un valore fuori opzioni → 422 `content-validation-error`.
- Candidato asse `L39-43` invariato: un tag multiplo o senza opzioni ora risponde 400 `content-invalid-kanban-axis`.

Test (`apps/api/src/features/content/handlers/kanban-move.test.ts`, unit — il file usa già un contesto Hono finto;
riscrittura). Fixture: `const posts = { ...CANONICAL_SEEDS.find(s => s.slug === 'posts')!, allowDrafts: false }`
(commento Rule 6.2.1: i canonici non hanno un seed kanban-compatibile; i drafts lo rendono incompatibile), asse
`br_11 priority`; `current` di default `{ id, title, priority: ['low'], updated_at }`.
- `it('replaces the single-choice value with the destination column value')` → patch `{ priority: ['high'] }`.
- `it('writes an empty array when the destination is the null column')` → `{ priority: [] }`.
- `it('reorders without patching the entry when axis is omitted')` → patch `null`.
- `it('rejects the legacy tags body with 400 content-invalid-body and writes nothing')`.
- `it('rejects a multiple-choice tags axis with 400 content-invalid-kanban-axis')` (`br_07`).
- `it('rejects a destination value outside the options with 422 content-validation-error and writes nothing')`.
Commento Rule 6.2.4 sul primo test: lo swap lasciava valore vecchio + nuovo su un tag singolo → 422.

### Task 5 — API: viste, 422 sui riferimenti a tag non ammessi

File: `apps/api/src/features/content/handlers/views.ts`.
- `createViewHandler` (`L86-97`): `config = parsed.data.config ?? emptyViewConfig()`; dopo `isViewAuthorized` e prima
  di `loadOrBootstrap`, `viewConfigChoiceIssues(config, seed)`; se non vuoto → `invalidView(context, issues[0])`
  (422 `content-invalid-view`). Nessuna riga scritta.
- `updateViewHandler` (`L120-128`): se `parsed.data.config` presente, stesso controllo prima di
  `repository.update`.
- Lettura invariata: la pulizia del Task 2 si applica tramite `projectContentView`.

Test (`apps/api/src/features/content/test/integration/content-views.integration.test.ts`, integration, harness +
D1 reale, canonici `posts` — `table` autorizzato):
- `POST /api/content/:slug/views`:
  - `it('refuses a table view sorted by a multiple-choice tags branch with 422 content-invalid-view and stores no instance')`
    (`sort.columnRef = 'br_07'`; stato: conteggio `seed_views` invariato rispetto al bootstrap).
  - `it('refuses a table view grouped by a multiple-choice tags branch with 422 content-invalid-view')`.
  - `it('stores a table view sorted and grouped by a single-choice tags branch')` (`br_11`; stato: config in riga).
- `PATCH /api/content/:slug/views/:viewId`:
  - `it('refuses a config grouped by a multiple-choice tags branch and keeps the stored config')`.
- `GET /api/content/:slug/views`:
  - `it('returns a stored config without sort on a multiple-choice tags branch')` (insert diretto in `seed_views`
    come il test esistente `L85`, commento Rule 6.2.1).

### Task 6 — API: automazioni con semantica array

File: `apps/api/src/features/automations/filters/when-evaluator.ts`, solo `compare` (`L52-79`). Il valutatore non
conosce il seed: la regola scatta quando l'operando sinistro è un array.
- `isempty`: vero anche per `[]`; `isnotempty` è la negazione.
- `eq`: con `left` array → vero se un elemento `coerceEqual` `right`; `neq` = negazione.
- `contains`: con `left` array → vero se un elemento è `=== right` (stringa); con `left` stringa → sottostringa
  (invariato).
- `in`: con `left` array → vero se un elemento di `left` `coerceEqual` un elemento di `right` (array); `notin` =
  negazione; `right` non array → `in` falso, `notin` vero (invariato).
- Altri operatori e `left` non array: invariati.
- Pushdown cron (`when-pushdown.ts`) non cambia: `eq`/`neq`/`contains` sui `tags` arrivano a SQL e il Task 3 li
  rende appartenenza; il ricontrollo in memoria (`cron-runner.ts:L76-78`) usa questa stessa semantica.

Test (`apps/api/src/features/automations/filters/when-evaluator.test.ts`, unit, `makeContext` del file; valore
`{ priority: ['high'] }` — alias e valori del canonico `posts.br_11`). Nuovo `describe('evaluateWhen — tags arrays')`:
- `it('eq on a tags array matches a member and neq is its negation')`.
- `it('contains on a tags array matches an exact member only')` (`'hi'` → falso).
- `it('in and notin on a tags array test overlap with the right-hand list')`.
- `it('isempty treats an empty tags array as empty')`.

Test aggiuntivo su SQL reale (`apps/api/src/features/content/test/integration/content-tag-options.integration.test.ts`,
integration, canonici `posts`; entry create via `POST` con `priority` `['high']`, `['low']`, `[]`). Nuovo
`describe('GET /api/content/:slug')`:
- `it('sorts by a single-choice tags branch in option order with empty values last')` (`sortBy=priority`; ordine
  `low`, `high`, vuoto; con `sortDir=desc`: `high`, `low`, vuoto).
- `it('filters a tags column with eq by membership')` (`filters` formato dashboard `{ priority: { columnId,
  type: 'tags', conditions: [{ op: 'eq', value: 'high' }] } }` → solo l'entry `high`).

### Task 7 — Dashboard lib: valori tag, filtri, colonne

**`lib/tags-utils.ts`** (aggiunte, verbatim):

```ts
/**
 * Orders two single-choice tags values. With options: declared option position, a value outside the options
 * after every option (ties keep their order). Without options: `localeCompare(…, "it")`. `null` (empty) is last.
 */
export function compareTagChoice(branch: Pick<Branch, "options">, a: string | null, b: string | null): number

/** Filter values for a `tags` column: option values in declared order when the branch has options, else `observed` deduplicated and sorted ("it"). */
export function tagFilterValues(branch: Pick<Branch, "options">, observed: readonly string[]): string[]
```
Stesse regole di rango del Task 3 (opzioni, obsoleto, vuoto in coda), così tabella e server concordano.

**`lib/filter-dsl.ts:L44-52`** (`buildFilterableColumns`): `branch.type === "tags"` → `type: "tags"`; il ramo
`json` + alias `tag` sparisce (un `json` diventa `"text"`, come gli altri tipi). Effetto: filtri toolbar e regole di
formattazione condizionale (`view-config-mapping.ts:L100`) usano `matchesTags*` (appartenenza) sui `tags`.

**`lib/dynamic-columns.tsx`** (`generateColumns`, `L131-188`):
- Branch `tags` multiplo → `enableSorting: false` sulla colonna. Altri tipi invariati.
- Branch `tags` singolo → `getGroupingValue` = primo valore (`extractTagNames(value)[0]`) o `""` se vuoto; aggregazione
  `count` come il ramo di default. Motivo: senza, TanStack crea un gruppo per riga (array per identità).

**`lib/dynamic-columns-lengths.ts:L45-46`**: rimuovere l'euristica `isTagsField` (dallo Sprint 3 un `json` non è più
reso come chip, quindi va troncato come ogni `json`). Aggiornare il JSDoc (`@returns` non cita più i tag).

Test:
- `lib/tags-utils.test.ts` (unit, `CANONICAL_SEEDS` `posts.br_11` / `br_07`):
  - `it('compareTagChoice orders option values by declared position, obsolete after options, empty last')` (matrice).
  - `it('compareTagChoice orders free values alphabetically with empty last')`.
  - `it('tagFilterValues returns the option values in declared order and ignores observed values')`.
  - `it('tagFilterValues returns observed values deduplicated and sorted for a branch without options')`.
- `lib/filter-dsl.test.ts` (unit, canonici `posts`):
  - `it('buildFilterableColumns types a tags branch as tags')` (`priority`, `tags`).
  - `it('buildFilterableColumns types a json branch as text whatever its alias')` (fixture malformata ammessa: un
    `json` con alias `tagsImages` — commento Rule 6.2.4: era l'euristica rimossa).
- `lib/dynamic-columns.test.tsx` (unit):
  - Aggiornare "calcola max … e ignora campi json 'tag'" (`L61-93`): `tagsImages` ora ha un `maxLength` ≥ 20; rinominare
    l'`it` di conseguenza (Rule 7.10: il test asseriva l'euristica rimossa).
  - `it('disables sorting on a multiple-choice tags column and keeps it on a single-choice one')` (canonici `posts`).
  - `it('groups a single-choice tags column by its first value')` (`getGroupingValue` → `'high'`, `''` per `[]`).

### Task 8 — Dashboard toolbar e tabella

**`features/content-toolbar/shared.ts:L195-232`** (`getGroupableColumns`): branch `tags` con `isSingleChoiceTags` →
`{ columnId: alias, label, section: "recommended", branchType: "tags" }`; tag multipli mai elencati.

**`features/content-toolbar/toolbar-hooks/use-toolbar-sort.ts:L27-35`**: un `tags` è sortabile solo se
`isSingleChoiceTags(branch)`; resto invariato (`policies.sort`).

**`features/content-management/hooks/use-content-list-query.ts:L140-176`**:
- `availableTagsByColumnIdFromData`: branch `b.type === "tags"` (non più `json` + alias).
- `availableTagsByColumnId`: per ogni alias, se il branch ha opzioni → `tagFilterValues(branch, [])`; altrimenti
  `tagFilterValues(branch, [...dati, ...facets])`. Il `localeCompare` locale sparisce (è dentro l'helper).

**`features/content-management/hooks/use-content-table-config.ts`**: nuovo campo di ritorno `rows: ContentEntry[]`.
Quando `groupBy` è l'alias di un `tags` singolo → copia di `data` ordinata in modo **stabile** con
`compareTagChoice` sul primo valore; altrimenti `data` invariato (stesso riferimento). Motivo: con `manualSorting`
TanStack ordina i gruppi per prima occorrenza; riordinare le righe per gruppo dà l'ordine delle opzioni senza
toccare l'ordine server dentro ogni gruppo.
**`components/content-table-renderer.tsx:L48`**: `data={tableConfig.rows}`.

Test:
- `features/content-toolbar/test/unit/shared.test.ts` (unit, canonici `posts`):
  - `it('getGroupableColumns lists a single-choice tags branch as recommended and omits a multiple-choice one')`.
- `features/content-toolbar/test/unit/toolbar-hooks.test.ts` (unit):
  - `it('useToolbarSort omits multiple-choice tags branches from the sortable columns')`.
- `features/content-management/test/unit/use-content-table-config.test.ts` (unit, nuovo, `renderHook`, canonici
  `posts`; entry con `priority` `['high']`, `[]`, `['low']`):
  - `it('orders rows by option position when grouping by a single-choice tags branch')` → `low`, `high`, vuoto.
  - `it('returns data unchanged when grouping by a non-tags column')` → stesso riferimento.

### Task 9 — Dashboard kanban

- **`features/content-kanban/utils/use-kanban-drag.ts:L280-284`**: cross-column → `body = { axisBranchId,
  position, axis: { value: destColValue } }` per ogni tipo di asse.
- **`components/content-kanban.tsx`**:
  - Prefill `L309-311`: colonna non `null` → `{ [alias]: kanbanColumnEntryValue(axisBranch, col.value) }`; colonna
    `null` → `{}` (invariato).
  - Update ottimistico `L79` e slot `L118-120`: il valore patchato è `kanbanColumnEntryValue(axisBranch, p.axisValue)`
    (oggi `p.axisValue` stringa → il chip diventa testo muto). `axisValue` resta la stringa colonna (usata per
    l'appartenenza alle colonne).
  - `KanbanColumn` riceve `color={col.color}` (`L156-168`).
- **`components/kanban-column.tsx`**: prop `color?: string` (verbatim); se presente, un pallino `h-2 w-2
  rounded-full` con `backgroundColor: color`, `aria-hidden`, prima della label nel header (`L72`). Nessuna stringa
  nuova.
- `use-kanban-entry-sync.ts`, `use-kanban-columns.ts`, `kanban-settings-section.tsx`: nessuna modifica (firma
  `resolveKanbanColumns(branch)` invariata per loro; candidati filtrati dal core).

```ts
interface KanbanColumnProps {
  colValue: string | null
  label: string
  /** Option color of a tags-axis column; no dot when absent. */
  color?: string
  fetchState: KanbanColumnFetchState
  cards: KanbanCardDisplayModel[]
  collapsed: boolean
  canEdit: boolean
  canCreate: boolean
  sortActive: boolean
  onToggleCollapse: () => void
  onEdit: (id: string) => void
  onCreateEntry?: () => void
}
```

Test (`features/content-kanban/test/unit/kanban-settings-section.test.tsx`, unit, canonici `posts` con
`allowDrafts: false`): l'unico candidato è ora `Priority` (`br_11`), non `Tags` (`br_07`).
- Aggiornare il commento `L31` e i due test esistenti: `it("lists the seed's axis candidates under group-by")` →
  `Priority` presente, `Tags` assente; `it("picking Priority sets the axis and closes the menu")` → `axisBranchId:
  "br_11"`.
Il body del drag e il prefill sono coperti dal core (`kanbanColumnEntryValue`) e dal test API del Task 4; nessun test
nuovo su `use-kanban-drag` (hook di dnd-kit non coperto oggi).

### Task 10 — Dashboard gallery

- **`features/content-gallery/group-by-category.ts`**: firma

  ```ts
  export function groupByCategory(
    models: GalleryCardDisplayModel[],
    compareLabels?: (a: string, b: string) => number,
  ): GalleryCategoryGroup[]
  ```

  Senza `compareLabels` → ordinamento attuale (alfabetico "it", base). Con → gruppi ordinati da `compareLabels` sulle
  etichette. "Senza categoria" sempre in coda (invariato).
- **`gallery-hooks/use-content-gallery.ts:L46-50`**: se `cardFields.categoryBranch` è un `tags` singolo, passare
  `(a, b) => compareTagChoice(branch, a, b)`.
- **`folder-create-defaults.ts:L31-34`**: se il branch `groupBy` è `tags`, il valore è `[label]`; altrimenti
  invariato.

Test:
- `features/content-gallery/test/unit/group-by-category.test.ts` (unit; i modelli del file):
  - `it('orders groups with the given comparator and keeps the uncategorized group last')`.
- `features/content-gallery/test/unit/use-content-gallery.test.ts` (unit, canonici `posts`):
  - `it('con groupBy su un tag a scelta singola: cartelle nell'ordine delle opzioni')` (`priority`: `low` prima di
    `high` anche se `high` compare prima nei dati). Lingua dei nomi `it` coerente col file.
- `features/content-gallery/test/unit/folder-create-defaults.test.ts` (unit, nuovo, canonici `posts`):
  - `it('prefills a tags group-by field with a one-element array')` → `{ priority: ['high'] }`.
  - `it('prefills a text group-by field with the folder label')` → `{ title: '…' }`.
  - `it('returns undefined for the uncategorized folder')`.

### Task 11 — Docs e changelog

- `CHANGELOG.md`, sezione `## Unreleased — BREAKING`, nuova sottosezione `### Views (kanban, sort, group)`:
  - Kanban axis: only single-choice `tags` with options (and `boolean`); columns follow the option order and color.
  - `PATCH /api/content/:seed/:id/kanban-move`: `axis` is now `{ value }` (`kind`, `oldValue`, `newValue` removed);
    a tags move writes `[value]` / `[]`.
  - Sort and group-by on `tags` only when single choice, in option order (alphabetical without options), empty
    values last; `sortBy` on a multiple-choice `tags` field is ignored.
  - `POST/PATCH /api/content/:seed/views` answer `422 content-invalid-view` for sort, group-by, kanban axis or
    kanban sort on a `tags` field that does not allow it; stored views are cleaned on read.
  - Filters on `tags`: `eq`/`contains`/`in` test membership, `neq`/`not_contains`/`not_in` their negation (Public
    API included). Automation conditions compare `tags` arrays by membership.
- `docs/reference/internal-content.md:L26`: riga `sortBy` — nota sui `tags` (singolo: ordine opzioni; multiplo:
  ignorato).
- `docs/reference/public-api.md:L168-169`: una riga sotto l'elenco operatori con la semantica sui `tags`.
- `docs/build/schema-modeling.md:L91` (`multiple`) e `L114` (riga `tags`): "kanban axis, sort and group-by require
  `multiple: false` (kanban also requires `options`)".

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Exit code 0 per tutti, in ordine:

```bash
pnpm --filter @beechcms/core run type-check
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/testing build
pnpm --filter @beechcms/api run type-check
pnpm --filter @beechcms/dashboard run type-check
pnpm --filter @beechcms/dashboard test
pnpm run type-check            # turbo: cli, mcp, client, forms-react
pnpm beech test                # suite completa, integration D1 reale inclusa
pnpm run lint
pnpm run lint:tests            # placement dei test (testing_conventions §1)
graphify update .
```

Controllo manuale finale (`pnpm beech dev`, DB nuovo `pnpm beech db:reset && pnpm beech onboard --yes`):
1. `ticket` → vista Kanban: asse proposto solo sui tag a scelta singola; colonne nell'ordine delle opzioni con
   pallino colore; trascinare una card in un'altra colonna → 200, chip colorato corretto subito e dopo reload.
2. "+" in una colonna → il form si apre con il tag già scelto; salvare → 201.
3. Tabella `ticket`: header di un tag singolo ordinabile (ordine opzioni, vuoti in coda), "Raggruppa per" lo offre e
   i gruppi seguono l'ordine opzioni; un tag multiplo non è né ordinabile né raggruppabile.
4. Filtro toolbar "contiene" su un tag singolo (operatori tags di `getOperatorOptions`, `shared.ts:L162-168`) → il
   menu valori mostra le opzioni in ordine e restano solo le entry col valore; una regola di formattazione
   condizionale sullo stesso campo colora le righe giuste.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Sprint 3 committato prima dell'avvio; branch nuovo `feature/tag-choice-views` da quel commit.
- [ ] `resolveKanbanConfig` propone come asse `tags` solo `multiple: false` con opzioni; `resolveKanbanColumns` ha un
      solo parametro e dà `color` alle colonne tags.
- [ ] `KanbanMoveBody.axis` è `{ value: string | null }`; `grep -rn "oldValue\|kind: 'tags'\|kind: \"tags\"" apps packages --include='*.ts' --include='*.tsx'` vuoto (esclusi `node_modules`/`dist`).
- [ ] `kanbanColumnEntryValue` è l'unica traduzione colonna → valore: usato da `kanban-move.ts`, prefill e update
      ottimistico di `content-kanban.tsx`.
- [ ] `viewConfigChoiceIssues` esportato da `@beechcms/core`; `POST`/`PATCH /api/content/:slug/views` rispondono 422
      `content-invalid-view` sui riferimenti vietati e non scrivono nulla.
- [ ] `buildSelectQuery`: tag singolo ordinato per posizione opzione (con binding) o alfabetico, vuoti in coda;
      `orderBy` su tag multiplo ignorato; `eq`/`neq`/`contains`/`not_contains`/`in`/`not_in` su `tags` = appartenenza.
- [ ] `evaluateWhen` applica la semantica array a `eq`/`neq`/`contains`/`in`/`notin`/`isempty`/`isnotempty`.
- [ ] Dashboard: nessuna euristica "alias contiene `tag`" (`grep -rn 'includes("tag")' apps/dashboard/src` vuoto);
      `buildFilterableColumns` tipizza i `tags` come `"tags"`; tag multipli non ordinabili né raggruppabili;
      gruppi tabella e cartelle gallery nell'ordine opzioni; prefill cartella su `tags` = array.
- [ ] Nessuna modifica a `packages/cli`, `packages/mcp`, `packages/client`, `packages/forms-react`, migrazioni, seed
      demo, `automation-value-input.tsx`.
- [ ] Docs e `CHANGELOG.md` aggiornati come da Task 11.
- [ ] Tutti i comandi della SECTION 5 a exit 0; nessun `it.skip`/`it.only`; test conformi a
      `testing_conventions.md` (tier, placement, fixture canonici, quattro zone, error path su `type` non sul
      messaggio).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

L'executor NON deve:

- Migrare dati, seed o viste salvate (`text` → `tags`, `string[]` → `TagOption[]`, config di vista): rimandato alla
  0.9 (ROADMAP "Rimandato fuori dalla serie", brief §5).
- Offrire kanban, ordinamento o raggruppamento sui tag multipli (carta in più colonne, ordinamento per primo
  elemento): scartato (brief §5).
- Dare colonne kanban ai tag liberi (senza opzioni) da valori osservati o facets: l'asse richiede opzioni (Scoperta 1).
- Mostrare nel kanban le card con valore obsoleto (oggi non compaiono in nessuna colonna: `kanbanColumnFilter`
  invariato).
- Rifiutare un cambio di seed (`multiple` → `true`) perché una vista salvata lo referenzia: la pulizia in lettura
  basta.
- Rendere chip colorati nell'intestazione dei gruppi tabella o delle cartelle gallery (etichetta testuale invariata).
- Toccare `automation-value-input.tsx`, `automation-ops.ts`, `when-pushdown.ts`, `filter-translation.ts`,
  `toEngineFilters` (`query-utils.ts`), `public/query/query-builder.ts`: la semantica array arriva dal core.
- Cambiare la semantica dei filtri sul tipo `json` o degli operatori `starts_with`/`ends_with`/`has_*`.
- Toccare editor/chip/seed builder (Sprint 3), schema plan/apply (Sprint 2), validatori e boot (Sprint 1).
- Aggiungere chiavi i18n, componenti UI di libreria, dipendenze.
