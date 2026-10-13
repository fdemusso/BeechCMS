# Sprint Plan — `TagChoiceEditing`

Serie: ROADMAP §3 (`stages/01_sprint_planning/output/backlog/ROADMAP.md`). Sprint 1 `TagOptionsContract` e Sprint 2
`SchemaPlanDefinitionDiff` sono **DONE** (review PASS, archivi in `docs/Sprints/`).
Brief: `stages/00_ideation/output/feature_brief.md` — user story "menu a tendina con pallino colorato", "chip
colorati in form, tabella, gallery e kanban", "seed builder definisce opzioni, colori e modalità"; regole §2.9
(colore solo dalle opzioni, tag liberi neutri, niente interpretazione colore/hex) e §4 "Valori obsoleti" /
"Presentazione".

### Pre-Computation Analysis

Grafo: `graphify-out/` aggiornato 2026-10-12 12:14 (dopo Sprint 1, prima del commit dello Sprint 2, che non tocca la
dashboard: il grafo è valido per questo sprint). Comandi usati: `explain`, `affected --depth 2`, `path`.

**a) God Nodes**
- `Branch` (`packages/core/src/engine/types.ts`) — `explain` ambiguo: 34 nodi omonimi; è il contratto letto da ogni
  renderer. Non cambia in questo sprint.
- `BranchItemRow()` (`components/fields/edit/repeater/repeater-branch-item.tsx:L95`) — degree 31; hub del seed
  builder, riceve il nuovo sotto-form.
- `JsonEdit()` (`components/fields/edit/json.tsx:L23`) — degree 15; oggi è anche l'editor dei `tags` con opzioni.
- `extractTagChips()` (`lib/tags-utils.ts:L76`) — degree 11; unica sorgente dei chip (display, gallery,
  `extractTagNames`).
- `FieldDisplay` (`components/fields/FieldDisplay.tsx:L14`) — degree 11; tabella (`lib/dynamic-columns.tsx:L379`),
  card kanban (`features/content-kanban/components/kanban-card.tsx:L42`) e metadata gallery
  (`gallery-card.tsx:L139`) passano tutti da qui → dal registro → dal renderer `tags`.

**b) Confini architetturali**
- `@beechcms/core`: **nessuna modifica**. Consumato in sola lettura: `isSingleChoiceTags` (`tag-options.ts:L11`),
  `tagOptionValues` (`L16`), `findTagOption` (`L21`), `tagOptionsIssues` (`L89`), tipo `TagOption`.
- `apps/api`: **nessuna modifica**. Il seed builder salva via `POST/PUT /api/seeds`, già validati da
  `validateSeedDefinitions` → 422 `validation-failed` (`features/seeds/seeds.helpers.ts:L129-142`), mostrato come
  toast da `useCreateSeed`/`useUpdateSeed`.
- `apps/dashboard`, solo codice condiviso + uno slice:
  - `lib/tags-utils.ts` (shared lib) — risoluzione chip.
  - `components/ui/tag-chips.tsx` (shared UI) — resa chip per tono.
  - `components/fields/` (shared): nuovi `edit/tags.tsx`, `display/tags.tsx`; `edit/json.tsx`, `display/json.tsx`,
    `registry.ts`, `edit/repeater/*` (seed builder: è `components/fields`, non uno slice).
  - `features/content-gallery/` (slice proprietario dello slot tag della card).
  - `locales/en.json`, `locales/it.json`.

**c) `graphify affected` (depth 2)**
- `extractTagChips` → `JsonDisplay` (display/json.tsx:L37), `buildGalleryCardDisplayModel`
  (gallery-card-display.ts:L131), `extractTagNames` (tags-utils.ts:L98), `useContentGallery`
  (use-content-gallery.ts:L42), `JsonEdit` (edit/json.tsx:L29), `normalizeCellFilterValue` /
  `useContentListQuery` (use-content-list-query.ts:L35, L153), `matchesTagsConditionLenient/Strict`
  (filter-dsl.ts:L149, L270), test: `tags-utils.test.ts`, `display-fields.test.tsx`, `gallery-card-display.test.ts`,
  `gallery-card.test.tsx`, `gallery-folder-card.test.tsx` (questi ultimi via il tipo `TagChipData`).
- `extractTagNames` → oltre ai precedenti: `ContentViewWorkspace` (pages/content-view-workspace.tsx:L63),
  `content-toolbar/shared.ts:L133` (re-export), `conditional-format.ts`, `dynamic-columns-aggregation.ts`,
  `drafts-list.tsx`, `view-config-mapping.ts` (imports_from del modulo). **Firma invariata** → nessuna rottura; cambia
  solo la semantica sugli input non-array (vedi Task 1), che per i `tags` non esistono più dallo Sprint 1.
- `JsonDisplay` → `registry.ts:L43`, `fields/index.ts:L10` (re-export), `repeater-generic-item.tsx:L12`,
  `field-registry.test.ts`, `FieldDisplay.tsx`, `FieldEdit.tsx`.
- `TagChips` → `JsonDisplay`, `GalleryCard` (gallery-card.tsx:L165), `GalleryGrid` (content-gallery.tsx:L65),
  test `edit-tags.test.tsx`, `display-fields.test.tsx`, `gallery-card.test.tsx`.
- `resolveCardFields` → `useContentGallery` (L39), `defaultCardConfig` (resolve-card-fields.ts:L93, non legge
  `tagsBranch`), `ContentGallery`, `GalleryViewRenderer`, test `resolve-card-fields.test.ts`,
  `use-content-gallery.test.ts`.
- `path "BranchItemRow" "tagOptionsIssues"` → nessun percorso: il seed builder oggi non usa le regole del core sulle
  opzioni (motivo del Task 6).

Scoperte che cambiano il perimetro rispetto alla voce di roadmap:
1. I `tags` senza opzioni sono editati dal code editor JSON (`edit/json.tsx:L134-151`); il brief non chiede altro
   per i tag liberi → restano così (delegati, vedi Task 3).
2. Lo slot tag della gallery è dedotto **solo** da un branch `json` con alias contenente `tag`
   (`resolve-card-fields.ts:L70-74`): un vero branch `tags` non compare mai nella card. Senza correggerlo, il brief
   "chip colorati in gallery" non è soddisfacibile.
3. `JsonDisplay` rende come chip anche i `json` con alias contenente `tag` e interpreta mappe `{tag: colore}`
   (`display/json.tsx:L33-47`): è esattamente l'interpretazione colore che il brief §2.9 elimina.

### VETO Audit

- **YAGNI.** Due renderer `tags` dedicati invece di altri rami dentro `JsonEdit`/`JsonDisplay`: il registro
  (`registry.ts:L44, L55`) mappa già il tipo `tags` su componenti JSON; separarli rimuove rami, non ne aggiunge. Nessun
  nuovo componente UI di libreria: menu = `Popover` esistente (lo stesso di `edit/json.tsx:L79-127`), chip = `Badge`.
  Nessun gating client del salvataggio nel seed builder: il server rifiuta già con 422 (stessa regola); il form mostra
  solo gli issue. Nessun calcolo di contrasto del testo, nessuna palette.
- **Botanical Invariant.** Nessun accesso D1, nessuna modifica API/core. Le regole sulle opzioni restano in
  `@beechcms/core` (`tagOptionsIssues`, `findTagOption`, `isSingleChoiceTags`); la dashboard le importa e non ne
  scrive di proprie (brief §2 "Dashboard … nessuna regola di validità propria"). I branch sono letti per oggetto
  `Branch` passato dal chiamante; nessun alias hardcoded (lo slot gallery sceglie per `type`, non per nome).
- **VSA.** Modifiche in `lib/`, `components/ui/`, `components/fields/` (shared) e in un solo slice
  (`features/content-gallery`). Zero import tra `features/*`. `features/seed-builder` non cambia: l'editor dei branch
  vive in `components/fields/edit/repeater/`.
- **Cloudflare purity.** Solo codice client React; nessun job, nessuna dipendenza.
- **Esito:** approvato. HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Lo Sprint 1 ha reso le opzioni dei `tags` vincolanti (`{ value, color }`, 400 fuori elenco, `multiple: false` = scelta
singola) e ha lasciato alla dashboard un **ponte di compilazione**: l'editor con opzioni sta dentro `JsonEdit`,
non distingue scelta singola da multipla (in singola si possono aggiungere due valori → 400 al salvataggio), i valori
obsoleti hanno lo stesso aspetto dei validi, la gallery non mostra mai un branch `tags`, `JsonDisplay` interpreta
ancora colori dentro i valori, e il seed builder **non ha alcun editor delle opzioni** (rimosso perché scriveva
`string[]`). Oggi le opzioni si dichiarano solo da codice/CLI/MCP.

Questo sprint chiude il lato inserimento e presentazione prima delle viste (Sprint 4) perché lo Sprint 4 riusa ciò che
nasce qui: il colore per valore (`resolveTagChips`) per le colonne kanban e il fatto che il seed builder possa
produrre tag a scelta singola, cioè gli unici assi kanban/ordinamento ammessi.

- **VSA:** tutto il lavoro sta nel codice condiviso della dashboard (`lib`, `components/ui`, `components/fields`) più
  lo slice proprietario della gallery; nessun import fra slice.
- **Botanical:** nessuna regola di validità nuova lato client; ogni decisione su opzioni/modalità/issue è una chiamata
  a `@beechcms/core`. Il server resta l'autorità (400/422).

Precondizione: il lavoro dello Sprint 2 (branch `feature/schema-plan-definition-diff`) è committato e il working tree
è pulito (incluso `CHANGELOG.md`, che al momento della pianificazione risulta cancellato nel working tree: va
ripristinato o il cambiamento va chiarito prima di partire). L'executor parte da un branch nuovo da quel commit.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Percorsi relativi a `apps/dashboard/src/` salvo diversa indicazione.

**Core (sola lettura, `packages/core/src/engine/seeds/tag-options.ts`)**
- `isSingleChoiceTags(branch)` `L11`: `type === 'tags' && multiple === false`.
- `tagOptionValues(branch)` `L16`: valori in ordine dichiarato, `[]` senza opzioni.
- `findTagOption(branch, value)` `L21`: match esatto.
- `tagOptionsIssues(branch): string[]` `L89`: messaggi inglesi con prefisso `branch '<alias>': `, `[]` = valido;
  tollera input non tipizzato (opzioni stringa, colore mancante, valore vuoto o con spazi, duplicati, `options: []`,
  opzioni su tipo non-`tags`).

**Risoluzione chip — `lib/tags-utils.ts`**
- `parseTagsValue` `L7-15` (JSON.parse lenient). `NEUTRAL_TAG_COLOR` `L18`, `colorForOption` `L21-23` (ponte Sprint 1).
- `TagChipData { label, color? }` `L25-28`; `extractTagChips` `L76-95` accetta array di stringhe **trimmate**, array di
  oggetti `{label|name|value, color|hex}` e mappe `{label: colore}` (`extractColor` `L34-49`): è l'interpretazione
  colore/hex che il brief elimina. `extractTagNames` `L97-99` = label di `extractTagChips`.

**UI chip — `components/ui/tag-chips.tsx`**
- `TagChips` accetta `string | {label, color?}` (`L13-18`), trimma (`L40-49`), colora con `backgroundColor` +
  testo bianco quando `color` è presente (`L96-114`), altrimenti `Badge` nel `chipVariant` dato.

**Editor — `components/fields/edit/json.tsx`**
- `L24` `hasOptions = type === 'tags' && tagOptionValues(branch).length > 0`; `L25` calcolo `isReadOnly`;
  `L28-132` editor chip + `Popover` (nessuna distinzione singola/multipla, nessun pallino colore, testi inglesi
  hardcoded, aria-label `Remove tag <v>` / `Add tag`); `L134-151` code editor JSON con parse ad array per i `tags`.
- `registry.ts`: `L44` `registerDisplay('tags', JsonDisplay)`, `L55` `registerEdit('tags', JsonEdit)`.
- `FieldEdit.tsx:L30` instrada solo per tipo (ponte Sprint 1 già fatto).

**Display — `components/fields/display/json.tsx`**
- `L33` `isTagsField = type === 'tags' || alias contiene "tag"`; `L36-47` mappa oggetto → chip con colori nei valori;
  `L49-56` array → colore da `colorForOption`. Usato da tabella, card kanban e metadata gallery via `FieldDisplay`.
- `FieldDisplay.tsx:L22-24`: con visibilità `masked` passa `value="••••••••"` al renderer.

**Gallery — `features/content-gallery/`**
- `resolve-card-fields.ts:L70-74`: `tagsBranch` = primo branch `json` con alias contenente `tag`.
- `gallery-card-display.ts:L10, L31, L130-132`: `tags: TagChipData[]` da `extractTagChips(...)` (senza colori).
- `gallery-components/gallery-card.tsx:L164-177`: `TagChips` `chipVariant="outline"`, `maxVisible={2}`.

**Seed builder — `components/fields/edit/repeater/`**
- `repeater-branch-options.tsx`: pattern sotto-form `FileOptionsForm` `L149-195` (props `{branch, onChange}`,
  helper `set`, `Checkbox` + `Label` `L171-178`, chiave i18n `seedBuilder.branchEditor.multiple`).
- `repeater-branch-item.tsx`: import sotto-form `L19-26`; `emitChange` `L119-122` passa da
  `withoutIneligibleLocalized` (pattern di pulizia per tipo); sotto-form per tipo `L270-285`; i sotto-campi repeater
  ammettono `tags` (`LEAF_BRANCH_TYPES` `L44-52`); alias/tipo bloccati sui branch esistenti (`isExisting` `L109`).
- `repeater-localization.ts:L21` `withoutIneligibleLocalized(branch, subField): Branch` — pattern helper puro.
- Test pattern per sotto-form: `components/fields/localized-options-form.test.tsx:L11-29` (checkbox per nome; "rimuove
  la chiave invece di scrivere false").

**i18n — `locales/en.json`, `locales/it.json`**
- `fields` ha solo `restricted`, `repeater.*`. `seedBuilder.branchEditor.options` / `optionsPlaceholder` /
  `optionsHint` descrivono il vecchio input a virgole e non sono letti da nessun file (grep vuoto).

**Fixture canonici (`@beechcms/testing`, già dipendenza della dashboard, `package.json:L96`)**
- `CANONICAL_SEEDS` → seed `posts`: `br_07 tags` (tag liberi, multipli), `br_11 priority` (`type: 'tags'`,
  `multiple: false`, opzioni `low #64748b`, `high #ef4444`; `packages/testing/src/seeds/canonical.seeds.ts:L44-55`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Tutto in `apps/dashboard/src/` salvo `docs/`. Nessun file in `packages/` o `apps/api/`.

Codice
- EDIT `lib/tags-utils.ts` — `TagChipData` con `tone`; `resolveTagChips`; `extractTagNames` solo array di stringhe.
- EDIT `components/ui/tag-chips.tsx` — nuovo `TagChip` esportato; `TagChips` accetta solo `TagChipData[]`.
- NEW `components/fields/edit/tags.tsx` — `TagsEdit`.
- NEW `components/fields/display/tags.tsx` — `TagsDisplay`.
- EDIT `components/fields/edit/json.tsx` — rimosso il ramo opzioni.
- EDIT `components/fields/display/json.tsx` — rimossi i rami tag.
- EDIT `components/fields/registry.ts` — `tags` → `TagsDisplay` / `TagsEdit`.
- NEW `components/fields/edit/repeater/repeater-tag-options.ts` — `withoutIneligibleTagOptions`.
- EDIT `components/fields/edit/repeater/repeater-branch-options.tsx` — `TagOptionsForm`, `DEFAULT_TAG_OPTION_COLOR`.
- EDIT `components/fields/edit/repeater/repeater-branch-item.tsx` — render del form + pulizia in `emitChange`.
- EDIT `features/content-gallery/resolve-card-fields.ts`, `features/content-gallery/gallery-card-display.ts`.
- EDIT `locales/en.json`, `locales/it.json`.

Test
- EDIT `lib/tags-utils.test.ts` (riscritto), NEW `components/fields/tags-edit.test.tsx`,
  NEW `components/fields/tag-options-form.test.tsx`, EDIT `components/fields/display-fields.test.tsx`,
  EDIT `components/fields/edit-tags.test.tsx`, EDIT `components/fields/json-edit.test.tsx`,
  EDIT `features/content-gallery/test/unit/resolve-card-fields.test.ts`,
  EDIT `features/content-gallery/test/unit/gallery-card-display.test.ts`,
  EDIT `lib/filter-dsl.test.ts`, EDIT `features/content-management/test/unit/content-list-hooks.test.ts`
  (fixture di filtro/normalizzazione tag: mappa oggetto e `[{name}]` → array di stringhe, vedi Task 9); fixture `tags` di
  `gallery-card.test.tsx` / `content-gallery.test.tsx` / `gallery-folder-card.test.tsx` solo se il type-check lo impone.

Docs
- EDIT `docs/manage/content-editor.md` (sezione "Fill Fields"), `CHANGELOG.md` (voce non-breaking sotto
  `## Unreleased — BREAKING`, sotto-sezione dashboard).

Esclusi: kanban/ordinamento/raggruppamento/regole/automazioni (SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Risoluzione chip senza interpretazione colore (`lib/tags-utils.ts`)

Scelta: una funzione sola decide colore e tono di ogni valore, dalle opzioni del branch; motivo: display, editor e
gallery devono dare lo stesso risultato e il colore esiste solo nelle opzioni (brief §2.9).

Firme esportate, verbatim (sostituiscono `TagChipData`, `NEUTRAL_TAG_COLOR`, `colorForOption`, `extractTagChips`):

```ts
/** How a tag chip is drawn: a declared option, a value no longer among the options, or a free tag. */
export type TagChipTone = "option" | "obsolete" | "free"

export interface TagChipData {
  readonly label: string
  /** Declared option color; present only when `tone === "option"`. */
  readonly color?: string
  readonly tone: TagChipTone
}

/** Stored tag values in order: string items of an array (or JSON-encoded array), verbatim. `[]` for anything else. */
export function extractTagNames(value: unknown): string[]

/** One chip per stored value, colored only from the branch options. Never throws. */
export function resolveTagChips(value: unknown, branch: Pick<Branch, "options">): TagChipData[]
```

Regole:
- `parseTagsValue` resta invariata ed esportata.
- `extractTagNames`: passa da `parseTagsValue`; se il risultato non è un array → `[]` (mappe oggetto, numeri, `null`,
  stringhe non-JSON). Dagli array tiene solo gli elementi `string` non vuoti, **senza trim** e nell'ordine dato
  (confronto esatto, brief §4); scarta in silenzio tutto il resto (niente `console.warn`). Duplicati conservati (lettura
  indulgente).
- `resolveTagChips`: per ogni nome di `extractTagNames(value)` → `findTagOption(branch, name)` (core): trovato →
  `{ label, color: option.color, tone: "option" }`; non trovato e il branch ha opzioni (`tagOptionValues(branch).length
  > 0`) → `{ label, tone: "obsolete" }`; branch senza opzioni → `{ label, tone: "free" }`.
- Eliminare `NEUTRAL_TAG_COLOR`, `colorForOption`, `extractTagChips`, `extractColor`, `extractArrayItemChip`, `ownProp`.
- I consumatori di `extractTagNames` (`filter-dsl.ts:L149, L270`, `use-content-list-query.ts:L35, L153`) non si
  toccano nel codice, ma i loro test sì: asserivano le forme rimosse (mappa `{tag: colore}`, `[{name}]`) che ora
  danno `[]`. Fixture aggiornate nel Task 9 (`filter-dsl.test.ts`, `content-list-hooks.test.ts`).

### Task 2 — Chip per tono (`components/ui/tag-chips.tsx`)

Scelta: un componente `TagChip` unico usato da `TagChips` e dall'editor; motivo: l'editor ha bisogno dello stesso
chip dentro un bottone di rimozione, e i tre toni devono apparire identici ovunque.

Props verbatim:

```ts
export interface TagChipProps {
  readonly chip: TagChipData
  /** Badge variant for "free" chips; "option" chips are filled with their color, "obsolete" chips are always outline. */
  readonly variant?: BadgeVariant
  readonly className?: string
}
export function TagChip({ chip, variant, className }: TagChipProps): React.JSX.Element
```

`TagChipsProps.tags` diventa `readonly TagChipData[]` (via il tipo locale `TagChip`/`TagValue` `L13-18` e
`normalizeTags` `L40-49`; nessun trim, i label arrivano già puliti da `resolveTagChips`). Il resto delle props non
cambia; `chipVariant` è passato a `TagChip` come `variant`.

Resa (copia `Badge` + classi di `L97-113`):
- `option`: sfondo/bordo `chip.color`, testo `#fff` (comportamento attuale).
- `free`: `Badge` nel `variant` dato, nessuno stile inline (chip neutro).
- `obsolete`: `Badge variant="outline"`, bordo tratteggiato e testo `text-muted-foreground`; `title` e `aria-label` =
  `t("fields.tags.notInOptions", { value: chip.label })` (`useTranslation` nel componente); testo visibile = label.
- In tutti i toni: `<span>` interno con `block min-w-0 max-w-[260px] truncate` e `title` = label (contratto del test
  #301 in `edit-tags.test.tsx`).
- Chiave React in `TagChips`: label + indice (i duplicati sono ammessi in lettura).

### Task 3 — Editor `TagsEdit` (`components/fields/edit/tags.tsx`, NEW)

Scelta: renderer dedicato registrato per `tags`; senza opzioni delega a `JsonEdit` (code editor JSON, invariato);
motivo: separa la scelta chiusa dal JSON e rende esplicita la modalità singola/multipla.

Firma: `export function TagsEdit(props: FieldEditProps): React.JSX.Element` (`FieldEditProps` da `../types`).

Comportamento (struttura visiva: copia `edit/json.tsx:L39-131` — riga di chip-bottone + `Popover` con `Button` "+"):
- `tagOptionValues(branch).length === 0` → `return <JsonEdit {...props} />`.
- `isReadOnly`: stessa espressione di `edit/json.tsx:L25`.
- `single = isSingleChoiceTags(branch)` (core). `selected = extractTagNames(value)`; chip =
  `resolveTagChips(value, branch)`.
- Chip: ogni chip è un `<button type="button">` che avvolge `TagChip` con l'overlay `X` al hover (copia `L46-71`);
  `aria-label` = `t("fields.tags.remove", { value })`; click → emette `selected` senza quel valore (`[]` se era
  l'unico). I chip `obsolete` sono rimovibili come gli altri (è il modo di ripulire un valore obsoleto).
- Nessun valore → testo `t("fields.tags.empty")`.
- Trigger `Popover`: `Button` "+" con `aria-label` = `t("fields.tags.add")`; intestazione del menu
  `t("fields.tags.menuTitle")`.
- Menu: una voce per opzione, **nell'ordine dichiarato**; ogni voce = pallino `aria-hidden` (`size-2.5 rounded-full`,
  `backgroundColor: option.color`) + valore + `Check` se selezionata. I valori obsoleti non compaiono nel menu.
- Scelta singola: click su un'opzione non selezionata → emette `[valore]` (sostituisce anche un obsoleto) e chiude;
  click sull'opzione già selezionata → chiude senza emettere.
- Scelta multipla: click su opzione non selezionata → emette `[...selected, valore]` e chiude; click su opzione
  selezionata → la rimuove (comportamento attuale `L32-35`, `L103-107`). Se tutte le opzioni sono selezionate, nota
  `t("fields.tags.allSelected")` (solo multipla).
- `isReadOnly` → niente trigger "+", i chip-bottone sono `disabled` e non emettono.
- Emette sempre `string[]` (contratto API, Sprint 1). Nessun controllo `requiredOn*` lato client: lo fa il form/server.

### Task 4 — Display `TagsDisplay` (`components/fields/display/tags.tsx`, NEW) e pulizia JSON

Firma: `export function TagsDisplay({ branch, value }: FieldDisplayProps): React.JSX.Element`.

- `value == null || value === ""` → `-` muted (come `display/json.tsx:L20-22`).
- Una stringa che non è JSON (es. la maschera `••••••••` che `FieldDisplay.tsx:L22-24` inietta per `masked`) → resa
  come testo muted così com'è.
- Altrimenti `<TagChips tags={resolveTagChips(value, branch)} className="min-w-0 max-w-full gap-1.5" />` (tutti
  visibili, come l'attuale ramo array `L49-56`); nessun chip → `-` (default `emptyState`).

`display/json.tsx`: elimina `L33-56` (`isTagsField`, ramo mappa, ramo array) e gli import di `TagChips` /
`tags-utils`; il doc-comment `L13-18` torna a descrivere solo JSON. Un branch `json` con alias `tags` ora si vede come
JSON (l'euristica sull'alias sparisce: brief §2.9).

`edit/json.tsx`: elimina `hasOptions` e il ramo `L28-132` con gli import non più usati (`Check`, `Plus`, `X`, `Badge`,
`Button`, `Popover*`, `cn`, `tagOptionValues`, `tags-utils`, `useState`). Resta il code editor `L134-151` col parse ad
array per `tags` (serve ai tag liberi delegati dal Task 3).

`registry.ts`: `L44` → `registerDisplay('tags', TagsDisplay)`, `L55` → `registerEdit('tags', TagsEdit)`.
Tabella, card kanban e metadata gallery ricevono il nuovo display senza modifiche (passano da `FieldDisplay`).

### Task 5 — Gallery: slot tag su branch `tags`, chip colorati

- `resolve-card-fields.ts:L70-74`: `tagsBranch` = primo branch con `type === "tags"` nell'ordine del seed; nessun
  criterio sull'alias. Motivo: `tags` è l'unico modello di tag; il criterio `json`+alias non trova mai un `tags`.
  Aggiorna il doc-comment di `resolveCardFields` (`L22-27`) se cita la deduzione dei tag.
- `gallery-card-display.ts:L130-132`: `resolveTagChips(entry.data[tagsBranch.alias], tagsBranch)`; import da
  `@/lib/tags-utils` (`L10`). `GalleryCardDisplayModel.tags` resta `TagChipData[]` (nuova forma con `tone`).
- `gallery-card.tsx`: nessuna modifica (i chip `option` sovrascrivono l'`outline` con lo stile inline).

### Task 6 — Seed builder: opzioni, colori, modalità

**6a. Pulizia per tipo — `components/fields/edit/repeater/repeater-tag-options.ts` (NEW)**

Copia la forma di `repeater-localization.ts:L21`. Firma verbatim:

```ts
/** Drops `options` from a non-`tags` branch: options on any other type are a fatal seed error. Same object when nothing changes. */
export function withoutIneligibleTagOptions(branch: Branch): Branch
```

Regola: `type !== "tags"` e chiave `options` presente → copia senza `options`; altrimenti restituisce `branch`.
`multiple` non si tocca (valido anche su `file`/`relation`).
`repeater-branch-item.tsx:L120-122`: `emitChange` applica `withoutIneligibleLocalized` e poi
`withoutIneligibleTagOptions`. Motivo: un branch nuovo `tags` con opzioni ritipizzato in `text` produrrebbe un seed
che il server rifiuta.

**6b. `TagOptionsForm` — `repeater-branch-options.tsx`**

Costante e props verbatim:

```ts
/** Color preset for a newly added option row; the author changes it with the color picker. */
export const DEFAULT_TAG_OPTION_COLOR = "#64748b"

/**
 * Properties for the {@link TagOptionsForm} component.
 */
export interface TagOptionsFormProps {
  /** The current `tags` branch definition. */
  branch: Branch
  /** Callback triggered when the options list or the choice mode changes. */
  onChange: (updated: Branch) => void
}
export function TagOptionsForm({ branch, onChange }: TagOptionsFormProps): React.JSX.Element
```

Layout: copia il contenitore di `FileOptionsForm` (`L168-195`: `rounded-md border p-2`, titolo `text-xs
font-medium` = `t("seedBuilder.branchEditor.options")`).

Regole:
- **Modalità.** `Checkbox` id `tags-multiple-${branch.id}` + `Label` `t("seedBuilder.branchEditor.multiple")`
  (copia `L171-178`). `checked = !isSingleChoiceTags(branch)`. Togliere la spunta → `multiple: false`. Metterla →
  **rimuove la chiave** `multiple` (omesso = multipla, default del core; stesso idioma di `LocalizedOptionsForm`).
- **Righe opzione**, nell'ordine di `branch.options`: `Input` testo per `value` (`aria-label` =
  `t("seedBuilder.branchEditor.optionValue")`), `Input type="color"` per `color` (`aria-label` =
  `t("seedBuilder.branchEditor.optionColor")`), bottoni icona su/giù (`ChevronUp`/`ChevronDown` da `reicon-react`,
  `aria-label` `moveOptionUp`/`moveOptionDown`, disabilitati alla prima/ultima riga) e rimozione (`Trash2`,
  `aria-label` `removeOption`). Ogni modifica emette un nuovo array `options` (immutabile); il valore digitato è
  scritto così com'è (nessun trim: lo segnala il core).
- **Aggiunta.** Bottone `t("seedBuilder.branchEditor.addOption")` → appende `{ value: "", color:
  DEFAULT_TAG_OPTION_COLOR }` (crea `options` se assente).
- **Lista vuota.** Rimuovere l'ultima riga **rimuove la chiave** `options` (assente = tag liberi; `[]` è fatal nel
  core). Senza opzioni il form mostra `t("seedBuilder.branchEditor.freeTagsHint")`.
- **Errori.** Sotto le righe, `tagOptionsIssues(branch)` (core) come lista `text-xs text-destructive`; vuota → niente.
  Nessuna regola propria, nessun blocco del salvataggio: il server risponde 422 con gli stessi messaggi
  (`seeds.helpers.ts:L134-142`).
- Il form non legge né scrive altri campi del branch.

**6c. Render — `repeater-branch-item.tsx`**: aggiungi `TagOptionsForm` all'import `L19-26` e
`{branch.type === "tags" && <TagOptionsForm branch={branch} onChange={emitChange} />}` dopo il form `file` (`L281`).
Vale anche per i sotto-campi repeater (il core valida le opzioni ricorsivamente, `tag-options.ts:L89-105`) e per i
branch esistenti (opzioni e modalità sono definizione, non DDL: lo Sprint 2 ne mostra il diff).

### Task 7 — i18n (`locales/en.json`, `locales/it.json`)

Aggiungi `fields.tags` (stesse chiavi in entrambi i file):

| chiave | en | it |
|---|---|---|
| `fields.tags.empty` | `No value selected` | `Nessun valore selezionato` |
| `fields.tags.menuTitle` | `Choose from the options` | `Scegli tra le opzioni` |
| `fields.tags.allSelected` | `All options are already selected.` | `Tutte le opzioni sono già selezionate.` |
| `fields.tags.add` | `Choose a value` | `Scegli un valore` |
| `fields.tags.remove` | `Remove {{value}}` | `Rimuovi {{value}}` |
| `fields.tags.notInOptions` | `{{value}} — not in the options` | `{{value}} — non presente nelle opzioni` |

In `seedBuilder.branchEditor`: `options` diventa `Options` / `Opzioni`; elimina `optionsPlaceholder` e `optionsHint`;
aggiungi:

| chiave | en | it |
|---|---|---|
| `optionValue` | `Value` | `Valore` |
| `optionColor` | `Color` | `Colore` |
| `addOption` | `Add option` | `Aggiungi opzione` |
| `removeOption` | `Remove option` | `Rimuovi opzione` |
| `moveOptionUp` | `Move up` | `Sposta su` |
| `moveOptionDown` | `Move down` | `Sposta giù` |
| `freeTagsHint` | `No options: any value is accepted (free tags).` | `Nessuna opzione: qualsiasi valore è accettato (tag liberi).` |

### Task 8 — Documentazione

- `docs/manage/content-editor.md` § "Fill Fields" (`L156-163`): la riga "Dropdowns & Selectors" descrive i campi a
  scelta: menu con pallino colore; scelta singola sostituisce il valore, multipla aggiunge chip; un chip grigio
  tratteggiato segnala un valore non più presente nelle opzioni (va rimosso o sostituito prima di salvare, altrimenti
  il salvataggio è rifiutato).
- `CHANGELOG.md` sotto `## Unreleased — BREAKING`: una voce "Dashboard" non-breaking — editor di scelta per i `tags`
  con opzioni, chip colorati ovunque, valori obsoleti evidenziati, editor opzioni/colori/modalità nel seed builder; i
  `json` con alias `tag` non sono più resi come chip.

### Task 9 — Test (behaviour list)

Tutti unit tier, dashboard, virgolette doppie, header SPDX BUSL. Fixture: `CANONICAL_SEEDS` da `@beechcms/testing`,
seed `posts` → `priority` (`br_11`, singola, opzioni `low`/`high`) e `tags` (`br_07`, liberi). Variante multipla:
derivata da `priority` omettendo `multiple` (commento Rule 6.2.1: nessun branch canonico multiplo con opzioni). Unico
fixture a mano ammesso: input malformato per gli issue del seed builder (Rule 3.5).

**`lib/tags-utils.test.ts`** — riscritto, `// @vitest-environment node`, `describe` per simbolo.
- `parseTagsValue`: i due casi esistenti restano.
- `extractTagNames` restituisce le stringhe di un array (o di un array JSON-encoded) verbatim e in ordine, senza trim.
- `extractTagNames` restituisce `[]` per mappa oggetto, numero, `null` e stringa non-JSON (matrice).
- `extractTagNames` scarta elementi non stringa e stringhe vuote.
- `resolveTagChips` dà tono `option` e il colore dichiarato a un valore di `priority`.
- `resolveTagChips` dà tono `obsolete` senza colore a un valore fuori elenco, e anche a `"High"` (confronto esatto).
- `resolveTagChips` dà tono `free` senza colore a ogni valore di `posts.tags`.
- riordinare le opzioni non cambia il colore risolto di un valore.

**`components/fields/tags-edit.test.tsx`** — NEW, jsdom.
- singola: scegliere `high` dal menu con valore `[]` emette `["high"]`.
- singola: scegliere `high` con valore `["low"]` emette `["high"]` (sostituzione).
- singola: scegliere l'opzione già selezionata non emette nulla.
- multipla: scegliere `high` con valore `["low"]` emette `["low", "high"]`.
- cliccare il chip `low` (aria-label `Remove low`) emette `[]`.
- ogni voce del menu mostra un pallino col colore dichiarato dell'opzione, nell'ordine dichiarato.
- il chip di un valore selezionato ha come sfondo il colore dichiarato.
- un valore salvato fuori elenco appare come chip con aria-label `… — not in the options` e non compare nel menu.
- `readOnly`: nessun trigger "Choose a value"; il click sul chip non emette.
- `posts.tags` (senza opzioni) rende il code editor JSON (mock di `./json-code-editor` come in `json-edit.test.tsx`).

**`components/fields/tag-options-form.test.tsx`** — NEW, jsdom; pattern `localized-options-form.test.tsx`.
- su `priority`, spuntare "Multiple values" emette il branch **senza** la chiave `multiple`.
- su `posts.tags`, togliere la spunta emette `multiple: false`.
- "Add option" su `posts.tags` emette `options` con una riga `{ value: "", color: "#64748b" }`.
- "Move down" sulla prima riga di `priority` emette le opzioni in ordine `high`, `low`; il bottone "Move up" della
  prima riga è disabilitato.
- rimuovere l'unica opzione emette un branch senza la chiave `options` (fixture: `priority` ridotto alla sola
  opzione `low`, derivato dal canonico).
- cambiare il colore di una riga emette quel colore sulla sola riga toccata.
- un branch con valore duplicato e colore `red` (fixture malformata a mano) mostra i messaggi di `tagOptionsIssues`
  (asserire il conteggio delle voci uguale a `tagOptionsIssues(branch).length`, non il testo: Rule 5.4).
- `withoutIneligibleTagOptions` (stesso file, `describe` proprio): toglie `options` da un branch `text`; restituisce lo
  stesso oggetto per `priority`; lascia `multiple` su un branch `file`.

**`components/fields/display-fields.test.tsx`** — il `describe("JsonDisplay tags con opzioni")` (`L179-198`) diventa
`describe("TagsDisplay")` su `priority`:
- un valore valido è un chip con sfondo del colore dichiarato.
- un valore fuori elenco è un chip con aria-label `… — not in the options`.
- un valore di `posts.tags` è un chip senza stile inline.
- la stringa maschera `••••••••` è resa come testo.
Aggiungi a `JsonDisplay`: un branch `json` con alias `tags` e valore array è reso come JSON, non come chip (regression
guard: l'euristica sull'alias è rimossa per brief §2.9 — commento Rule 6.2.4).

**`components/fields/edit-tags.test.tsx`**
- caso `TagChips` `L27`: passa `[{ label: longTagText, tone: "free" }]`; asserzioni invariate.
- caso `JsonEdit … tronca` `L40`: diventa `TagsEdit` con valore `[longTagText]`; asserzioni invariate.
- caso prototipo `L56`: **eliminato** (le mappe oggetto non sono più lette come tag; coperto da `extractTagNames` →
  `[]` su mappa).
- `FieldEdit routing` `L72-110`: aria-label `Remove pro`; resto invariato.

**`components/fields/json-edit.test.tsx`**: elimina i tre casi tags-con-opzioni `L40-71` (comportamento spostato in
`tags-edit.test.tsx`); gli altri restano.

**`lib/filter-dsl.test.ts`** — solo fixture, il comportamento atteso del filtro non cambia (il filtro legge
`extractTagNames`). Cella = array di stringhe (`'["react","cms"]'`, stessa forma JSON-encoded già accettata):
- `L128` "tags: contains/eq su keys estratte": cella `["react","cms"]`; stesse asserzioni (`react` contains/eq true,
  `angular` false).
- `L135` "tags: filtro vuoto -> sempre true (lenient)": cella `["react"]`; asserzioni invariate.
- `L183` "tags strict: filtro vuoto -> false; match/non-match": cella `["react","cms"]`; asserzioni invariate.
- NEW "tags: cella a mappa oggetto non matcha": cella `{"react":"#111111"}` con `contains` `react` → false in strict
  (regression guard della rimozione del formato; commento Rule 6.2.4).

**`features/content-management/test/unit/content-list-hooks.test.ts`** — `L34` "normalizza tag estraendo il primo
nome" → "normalizza tag estraendo il primo valore":
- `normalizeCellFilterValue("tags", ["react","ts"])` (e la stessa lista JSON-encoded) restituisce `"react"`.
- `normalizeCellFilterValue("tags", [])` restituisce `null` (invariato).
- `normalizeCellFilterValue("tags", [{ name: "react" }])` restituisce `null` (forma rimossa).

**`features/content-gallery/test/unit/resolve-card-fields.test.ts`** — `L87-96` sostituiti:
- `tagsBranch` è il primo branch `tags` del seed.
- un branch `json` con alias `tags` non diventa `tagsBranch`.

**`features/content-gallery/test/unit/gallery-card-display.test.ts`** — aggiungi in `buildGalleryCardDisplayModel`:
- con `tagsBranch` = `priority`, `model.tags` contiene il chip `high` con tono `option` e colore dichiarato.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Exit code 0 per tutti, in ordine, dalla root:

```bash
pnpm --filter @beechcms/testing build          # la dashboard legge i fixture canonici da dist
pnpm --filter @beechcms/dashboard run type-check
pnpm --filter @beechcms/dashboard test
pnpm run type-check                            # turbo: nessun altro consumatore rotto
pnpm beech test --diff
pnpm run lint
pnpm run lint:tests                            # placement test (testing_conventions §1)
graphify update .
```

Controllo manuale finale (`pnpm beech dev`): entry `clienti` → `tier` mostra menu con pallini, una scelta sostituisce
l'altra, salva 200; tabella/kanban/gallery mostrano chip colorati; seed builder → branch `tags` → aggiungere,
riordinare, colorare opzioni, togliere "Multiple values", salvare; `beech schema plan` riporta il seed come
`definition changed`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Lavoro dello Sprint 2 committato prima dell'avvio; branch nuovo da quel commit.
- [ ] Nessun file modificato in `packages/` o `apps/api/` (`git diff --name-only | grep -E '^(packages|apps/api)/'`
      vuoto).
- [ ] `lib/tags-utils.ts` esporta `TagChipTone`, `TagChipData` (con `tone`), `parseTagsValue`, `extractTagNames`,
      `resolveTagChips`; non esistono più `colorForOption`, `NEUTRAL_TAG_COLOR`, `extractTagChips`
      (`grep -rnE "colorForOption|NEUTRAL_TAG_COLOR|extractTagChips" apps/dashboard/src` vuoto).
- [ ] Nessuna interpretazione colore/hex nei valori: nessuna lettura di `color`/`hex` da un valore di entry nella
      dashboard; il colore di un chip viene solo da `findTagOption`.
- [ ] `registry.ts` registra `tags` → `TagsDisplay` / `TagsEdit`; `JsonEdit` e `JsonDisplay` non contengono rami
      `tags`-con-opzioni né l'euristica sull'alias.
- [ ] `TagsEdit`: singola sostituisce, multipla aggiunge, emette sempre `string[]`, menu nell'ordine delle opzioni con
      pallino colore, valori obsoleti come chip tratteggiato con "not in the options" e assenti dal menu.
- [ ] Gallery: slot tag = primo branch `tags`, chip colorati dalle opzioni.
- [ ] Seed builder: `TagOptionsForm` per ogni branch `tags` (anche sotto-campi); modalità via chiave `multiple`
      (`false` / assente); lista vuota = chiave `options` assente; errori da `tagOptionsIssues` e nessuna regola
      propria; ritipizzare da `tags` toglie `options`.
- [ ] Chiavi i18n della tabella del Task 7 presenti in `en.json` e `it.json`; `optionsPlaceholder` / `optionsHint`
      rimosse.
- [ ] `content-editor.md` e `CHANGELOG.md` aggiornati.
- [ ] Nessun test dashboard asserisce più mappe `{tag: colore}` o `[{name}]` come tag validi
      come valido: l'unica mappa rimasta è la fixture negativa di `filter-dsl.test.ts` (Task 9).
- [ ] Tutti i comandi della SECTION 5 a exit 0; nessun `it.skip`/`it.only`; test conformi a `testing_conventions.md`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

L'executor NON deve:

- Toccare `@beechcms/core`, `apps/api`, `packages/cli`, `packages/mcp`, `@beechcms/forms-react` o i seed demo.
- Toccare kanban (asse solo tag singoli, colonne colorate, `use-kanban-drag.ts`, `kanban-move`), ordinamento per
  posizione opzione, raggruppamento/toolbar (`content-toolbar/shared.ts`, `getGroupableColumns`), validazione config
  di vista su tag multipli, formattazione condizionale (`lib/conditional-format.ts`, incluso il suo `parseTagsValue`
  locale), `when-evaluator`, `automation-value-input.tsx` → ROADMAP §4 `TagChoiceViews`.
- Cambiare il codice del filtro tag (`filter-dsl.ts`, `use-content-list-query.ts`): leggono solo `extractTagNames`.
  Solo i loro test cambiano (fixture ad array, Task 9).
- Costruire un editor a chip per i tag **liberi** (restano sul code editor JSON), un calcolo del contrasto del testo,
  una palette di ripiego o colori per tag liberi (brief §5).
- Bloccare lato client il salvataggio del seed builder o duplicare in dashboard regole del core.
- Toccare `edit/select.tsx` / `MetaSelectBranch` (select del meta-seed, non è un `tags`).
- Migrazioni D1, compat per mappe `{tag: colore}` o `options: string[]`, migrazione dati (rimandata alla 0.9).
- Rigenerare a mano `docs/api/**` o bumpare versioni di pacchetto.
