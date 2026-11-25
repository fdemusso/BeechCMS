# Sprint: TagOptionsContract

Serie: `stages/01_sprint_planning/output/backlog/ROADMAP.md` — Sprint 1 di 4 (**NEXT**).
Brief: `stages/00_ideation/output/feature_brief.md`.

### Pre-Computation Analysis

**a) God Nodes (graphify CLI)**

| Nodo | Sorgente | Grado | Perché conta |
|------|----------|-------|--------------|
| `Seed` | `packages/core/src/engine/types.ts:L229` | 249 | Contiene `branches`; ogni consumatore di schema lo attraversa. |
| `Branch` | `packages/core/src/engine/types.ts:L77` | 70 | Porta `options` / `multiple`: è il tipo che cambia. |
| `SeedRegistry` | `packages/core/src/engine/seeds/seed-registry.ts:L46` | 21 | Costruito a ogni idratazione (`seed-registry-cache.ts:L66`): è il "boot" del brief. |

`graphify explain Branch` → importato da `ddl.ts`, `schema-builders.ts`, `validation/cache.ts`, `kanban.ts`,
`seed-registry.ts`, `manifest.types.ts`, `flat-seed.ts`, `schema-fingerprint.ts` (2 connessioni), `query.ts`,
`serialize.ts`, `policies.ts`, `localization.ts`, `seed-layout.ts`, `relation-audit.ts`, `file-branch.ts`.

Limite del grafo: gli import cross-package via `@beechcms/core` (dashboard, api, forms-react) e i simboli del working
tree non committato (`colorForOption`, `TAG_PALETTE` → `No affected nodes`) non sono risolti. Per quei punti, come da
euristica di `tooling_graphify.md` (simbolo noto → lookup diretto), i consumatori sono stati enumerati con `grep`
esatto su `branch.options` / `.options` in `apps/` e `packages/`.

**b) Confini architetturali toccati**

- `@beechcms/core`
  - `engine/types.ts` — nuovo `TagOption`, `Branch.options?: TagOption[]`.
  - `engine/seeds/tag-options.ts` (nuovo) — unica sorgente delle regole su opzioni e modalità.
  - `engine/seeds/seed-validation.ts` (Fatal 18) e `engine/seeds/seed-registry.ts` (guardia al boot).
  - `engine/validation/schema-builders.ts` (`tagsSchema`), `engine/validation/cache.ts` (chiave cache).
  - `engine/introspection/schema-fingerprint.ts` (proiezione + versione), `engine/seeds/seed-types-generator.ts`.
  - `dashboard-layout/kanban/kanban.ts` (via il ramo `text`).
- `apps/api`
  - `public/handlers/public-routes.ts` (proiezione `GET /:seed/schema`).
  - `shared/db/fixtures/demo-seeds.ts` (riscritto), `demo-seeds.fixtures.ts` (eliminato), `features/setup/index.ts`.
  - Write path di contenuti, import, MCP, kanban-move: **nessuna modifica** — conformi via
    `validateAndSanitizeSeedPayload` / `validateSeedDefinitions` (verificato: `create.ts:L78`,
    `import-chunk.worker.ts:L175`, `kanban-move.ts:L73`, `seeds.mcp.ts:L148/L254`, `seeds.helpers.ts:L134/L218`).
- `packages/forms-react` — `types.ts`, `hooks/useBeechForm.ts`.
- `packages/testing` — `seeds/canonical.seeds.ts` (+1 branch).
- `apps/dashboard` — solo ponte di compilazione, dentro lo slice proprietario di ogni file; nessuna nuova UX.
- Docs: `docs/build/schema-modeling.md`, `docs/reference/public-api.md`, `CHANGELOG.md` (nuovo).

**c) `graphify affected` (depth 2) — prova di controllo delle rotture**

```
affected tagsSchema               → No affected nodes found (privata; raggiunta solo da BRANCH_SCHEMA_BUILDERS)
affected resolveKanbanColumns     → kanban.test.ts
                                    (+ via grep: use-kanban-columns.ts, use-kanban-entry-sync.ts,
                                       kanban-settings-section.tsx — consumano solo value/label)
affected resolveKanbanConfig      → cleanKanban(), validateViewConfigAgainstSeed() (content-view.ts),
                                    core/src/index.ts, content-view.repository.ts, kanban.test.ts, content-view.test.ts
affected projectSchemaContract    → computeSchemaFingerprint(), schema-fingerprint.test.ts,
                                    docs SeedTypesOptions.md, docs/reference/public-api.md:L401 (X-Schema-Revision)
affected validateSeedDefinitions  → isSeedSetValid(), validateManifest() (manifest-validation.ts),
                                    seed-validation.test.ts, manifest-validation.test.ts, schema/index.ts, docs mcp-server.md
affected tsTypeForBranch          → interfaceForSeed(), generateSeedTypes(), seed-types-generator.test.ts
affected SeedRegistry (depth 1)   → InMemorySeedRegistry (inherits), seed-registry.test.ts, sortSeedsByDependencies()
affected compareManifest          → schemaDiff() (cli), manifest-compare.test.ts, schema-diff.test.ts  [Sprint 2]
path JsonEdit → extractTagNames   → No directed path (il legame passa da @/lib, non dal grafo)
```

Rotture attese e gestite in questo sprint: ogni lettura `branch.options` come `string[]` (core: `kanban.ts:L56,L97-103`,
`seed-types-generator.ts:L46-52`, `schema-fingerprint.ts:L77`; dashboard: 10 file, Task 13). `cleanKanban` assorbe
le config persistite con asse `text` (le azzera a `null`, comportamento esistente). Nessun consumatore dipende da
`KanbanAxisBranchType === 'text'` (grep: zero occorrenze fuori da `kanban.ts`).

### VETO Audit

- **YAGNI.** Nessuna tabella, nessuna migrazione D1, nessun DDL: la colonna `tags` resta `TEXT` (array JSON). Un solo
  modulo nuovo (`tag-options.ts`) che sostituisce logica oggi duplicata/assente; `findTagOption` esiste perché lo
  usa il ponte dashboard (colore del chip). Niente compat layer per `string[]` (brief §2.5). Il CLI/MCP plan-apply è
  spostato allo Sprint 2 (confine indipendente). Le funzioni delle viste (ordinamento per posizione opzione, errori
  config vista) sono Sprint 4: qui solo ciò che la compilazione o il contratto impongono.
- **Botanical Invariant.** Tutte le regole di validità vivono in `@beechcms/core`: `tagOptionsIssues` (seed) e
  `tagsSchema` (valori). API, import, MCP, kanban-move, forms-react e dashboard non aggiungono regole: si
  conformano. Nessuna query D1 nuova; nessuna query bypassa `apiToDb`/`dbToApi`. Le opzioni restano metadati del
  seed, identificate per `value`; i branch sono referenziati per id `br_XX` (nuovo canonico `br_11`).
- **VSA.** Modifiche dashboard confinate al file proprietario: `components/fields/*` e `lib/*` (condivisi),
  `features/seed-builder`, `features/automations`, `features/content-toolbar`, `features/content-management` —
  ognuno importa solo da `@beechcms/core`, `@/lib`, `@/components`. Il tipo `MetaSelectBranch` sta in
  `components/fields/types.ts` (condiviso), non in uno slice. Zero import tra feature. API: modifiche in `public/`
  e `shared/` + `features/setup` che già importava i fixture condivisi.
- **Cloudflare purity.** Solo codice puro in core, Web Crypto già in uso per il fingerprint. Nessun job, nessun ORM.
- **Esito:** nessuna violazione. Piano approvato.

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Il valore di un campo a scelta oggi ha due forme incoerenti (`text`+`options` → stringa, `tags`+`options` → array) e
`options` non vincola nulla: `tagsSchema` (`schema-builders.ts:L281-295`) accetta qualsiasi stringa e deduplica in
silenzio. Ogni sprint successivo (editor, chip, seed builder, kanban, ordinamento, plan/apply) legge la forma
`TagOption` e la modalità singola/multipla: senza il contratto stabile in core non c'è nulla su cui costruire.

Il cambio di `Branch.options` da `string[]` a `TagOption[]` è un cambio di tipo esportato: rompe la compilazione di
core, api, forms-react e dashboard nello stesso istante. Per questo questo sprint porta con sé il **ponte di
compilazione** di tutti i consumatori (senza nuova UX), così che ogni merge su `devs` resti verde.

- **Botanical Engine:** core resta l'unica autorità — boot (`tagOptionsIssues` usata sia da `validateSeedDefinitions`
  sia da `SeedRegistry`) e scrittura (`tagsSchema`). Nessun consumatore duplica le regole.
- **VSA:** il ponte dashboard tocca ogni file nel proprio slice; nessuna logica di dominio si sposta nella dashboard.
- **Rottura deliberata (brief §2.11):** nessuna migrazione; un DB con seed `text`+`options` o `options: string[]`
  fallisce all'idratazione con un messaggio che indica i `tags`. Documentato in `CHANGELOG.md`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondizione.** Il working tree su `devs` contiene un hotfix non committato che è la baseline di questo sprint:
`demo-seeds.ts` / `demo-seeds.fixtures.ts` (7 branch `text`→`tags` con `options: string[]`), `demo-data.fixtures.ts`
(valori già array, es. `tier: ['pro']`), `d1-widget.repository.ts` (`json_each` sui `tags`), `FieldEdit.tsx`
(`branch.type !== 'tags'`), `edit/json.tsx` (emette `string[]` per `tags`), `display/json.tsx` + `lib/tags-utils.ts`
(`TAG_PALETTE`, `colorForOption` posizionale). L'executor parte solo dopo che è committato.

**Core — tipo e semantica**
- `types.ts:L101-111`: `multiple?: boolean` documentato solo per media; `options?: string[]` "advisory".
- `multiple` è già usato da `file` e `relation` (`schema-builders.ts:L317`, `seed-validation.ts:L84,L100`). Nessun
  consumatore lo legge sui `tags`.

**Core — validazione dei seed (boot)**
- `validateSeedDefinitions` (`seed-validation.ts:L63-403`): Fatal 1–17 + Warning 7/8/10; nessun controllo su
  `options`. Ultimo blocco: Fatal 17 (`L365-400`), che già itera i sub-field dei repeater (`L390`).
- Chiamanti: seeds API (`seeds.helpers.ts:L134,L218`), MCP (`seeds.mcp.ts:L148,L254`), MCP locale
  (`packages/mcp/src/index.ts:L280`), CLI `validate` (`commands/validate.ts:L20`), manifest (`manifest-validation.ts:L46`),
  setup demo (via `validateAndApplySeedDef`, `features/setup/index.ts:L195-204`).
- `SeedRegistry` ctor (`seed-registry.ts:L50-79`) lancia su alias riservati e id non validi: costruito da
  `getHydratedRegistry` (`apps/api/src/shared/services/cache/seed-registry-cache.ts:L66`) a ogni idratazione.

**Core — validazione dei valori (scrittura)**
- `tagsSchema(options, allowNull)` (`schema-builders.ts:L281-295`): `z.array(string→cleanString)`, `max(100)`
  (`MAX_TAGS_COUNT`, `L203`), poi `transform` che **deduplica e scarta vuoti in silenzio** (`L293`). Ignora `branch`.
- Registrazione: `BRANCH_SCHEMA_BUILDERS.tags` (`L444`).
- `cleanString` = `stripControlChars(...).trim()` (`primitives.ts:L23-25`).
- Mappa issue → `ValidationDetail` (`validation/index.ts:L382-397`): `expected` = messaggio issue senza `Expected `;
  `message` = `Field '<f>' expects type '<expected>' but received '<received>'`. Una stringa nuda su `tags` produce
  già `expected 'array' … received 'string'` (da preservare).
- Obbligatorietà: `detectMissingRequired` + `isEffectivelyEmpty([]) === true` (`emptiness.ts:L20`) → un `tags`
  obbligatorio con `[]` è già rifiutato. Errori HTTP: `contentValidationProblem` → 400 `content-validation-failed`
  con `errors: ValidationDetail[]` (`content/handlers/helpers.ts:L37-48`).
- Cache: `buildBranchFingerprint` (`cache.ts:L94-109`) — `m: branch.multiple === true`, nessun campo per `options`.

**Core — contratti derivati**
- `schema-fingerprint.ts`: `SCHEMA_FINGERPRINT_VERSION = 1` (`L28`); `ContractBranch.options?: string[]` (`L36`);
  `projectBranch` copia `options` (`L77`) e `multiple` grezzo (`L75`). Esclusioni documentate in `L95-104`.
- `tsTypeForBranch` (`seed-types-generator.ts:L42-53`): `text`+`options` → unione letterale; `tags`+`options` →
  `(unione)[]`.
- Kanban (`kanban.ts`): `KanbanAxisBranchType = 'text'|'tags'|'boolean'` (`L8`); `isAxisCandidate` accetta `text`
  con opzioni (`L56`); `resolveKanbanColumns` ha ramo `text` (`L97-98`) e ordina i `tags` per `branch.options`
  (`L99-103`).

**API**
- `GET /api/v1/public/:seed/schema` (`public-routes.ts:L30-79`): legge `options` tramite cast a
  `Record<string, unknown>` e mappa stringhe → `{ label, value }` (`L50-53`); nessun `multiple`.
- Setup demo: `DEMO_SEED_DEFINITIONS` (`demo-seeds.ts:L171`, validato a `L195`) e `DEMO_SEEDS`
  (`demo-seeds.fixtures.ts:L160`, usato a `setup/index.ts:L268`) sono **due copie strutturalmente identiche**
  (verificato per alias/tipo/opzioni/required). `DEMO_SEEDS_BY_SLUG` e le costanti `DEMO_*_SEED` non hanno
  importatori esterni. Non esistono automazioni né formattazioni condizionali demo (grep su `fixtures/` e `setup/`):
  nulla da riscrivere oltre ai seed. Il layout demo usa `core/pie-chart` su `clienti.tier` (`setup/index.ts:L332`),
  già servito da `json_each` nella baseline.
- Test di guardia esistente: `apps/api/test/validate-all-demo-data.test.ts:L11` valida ogni fixture contro i seed.

**forms-react**
- Adattatore schema (`useBeechForm.ts:L85-118`): `options` stringa|oggetto → `{label,value}`; qualsiasi branch con
  opzioni diventa `type: 'select'`. Il payload (`L365-370`) invia il valore così com'è → una `<select>` su `tags`
  invia una stringa → 400 dopo questo sprint. `FormBranchSchema` in `types.ts:L35-46`.

**Testing**
- `CANONICAL_SEEDS.posts` (`packages/testing/src/seeds/canonical.seeds.ts:L28-50`): `br_07 tags` libero; nessun
  `tags` con opzioni. `posts` ha `allowPublicRead/Post/Edit: true`.

**Dashboard — consumatori di `branch.options` (grep esatto)**
- `lib/tags-utils.ts:L15-25` — `TAG_PALETTE`, `colorForOption(tag, options: string[])` (posizionale).
- `components/fields/edit/json.tsx:L39-75` — chip editor; colore da `colorForOption ?? TAG_PALETTE[0]`, nuovi tag
  colorati per indice; ramo legacy mappa `{tag: color}` per `json`.
- `components/fields/display/json.tsx:L49-55` — colore chip da `colorForOption`.
- `components/fields/FieldEdit.tsx:L30-34` — instrada a `SelectEdit` ogni non-`tags` con opzioni.
- `components/fields/edit/select.tsx:L15-27` — select su `string[]`; usato solo dal meta-seed (`registry.ts:L62-64`).
- `features/seed-builder/lib/meta-seed-layout.ts:L58-61` (`display_name_alias`, cast `as Branch`) e `L92-93`
  (`dash_icon`, senza cast) — vocabolari `string[]` del meta-seed (mai persistito).
- `components/fields/edit/repeater/repeater-branch-options.tsx:L263-293` — `TagsOptionsForm`: input CSV che scrive
  `options: string[]`; reso da `repeater-branch-item.tsx:L288-290` per `tags`/`json`.
- `features/automations/components/automation-editor/automation-value-input.tsx:L89-133` — select per `text`+opzioni,
  dropdown per `tags`/`json` + opzioni.
- `features/automations/components/automation-editor/automation-ops.ts:L9,L32` — `TEXT_OPTIONS_OPS`.
- `features/content-toolbar/shared.ts:L222-223` — `text`+opzioni → raggruppabile "recommended".
- `features/content-management/hooks/use-content-list-query.ts:L143-150` — semina il set tag dei `json` con
  `branch.options`.

Nessun context variable (`AppEnv.Variables`) né ordine middleware cambia in questo sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Core (`packages/core/src/`)
- EDIT `engine/types.ts` — `TagOption`, `Branch.options`, doc di `multiple`.
- NEW  `engine/seeds/tag-options.ts` + NEW `engine/seeds/tag-options.test.ts`.
- EDIT `index.ts` — export di `tag-options.js`.
- EDIT `engine/seeds/seed-validation.ts` (+ test) — Fatal 18.
- EDIT `engine/seeds/seed-registry.ts` (+ test) — guardia al boot.
- EDIT `engine/validation/schema-builders.ts` — `tagsSchema` vincolante.
- EDIT `engine/validation/index.test.ts` — casi tags.
- EDIT `engine/validation/cache.ts` (+ `cache.test.ts`).
- EDIT `engine/introspection/schema-fingerprint.ts` (+ test).
- EDIT `engine/seeds/seed-types-generator.ts` (+ test).
- EDIT `dashboard-layout/kanban/kanban.ts` (+ `kanban.test.ts`), EDIT `dashboard-layout/content-view.test.ts` (fixture).

API (`apps/api/`)
- EDIT `src/public/handlers/public-routes.ts`.
- NEW  `src/public/test/integration/public-schema.integration.test.ts`.
- NEW  `src/features/content/test/integration/content-tag-options.integration.test.ts`.
- REWRITE `src/shared/db/fixtures/demo-seeds.ts`; DELETE `src/shared/db/fixtures/demo-seeds.fixtures.ts`.
- EDIT `src/features/setup/index.ts` (import + `L268`).
- EDIT `test/validate-all-demo-data.test.ts` (+1 `it`).

Packages
- EDIT `packages/testing/src/seeds/canonical.seeds.ts` (+`br_11`).
- EDIT `packages/forms-react/src/types.ts`, `src/hooks/useBeechForm.ts`; EDIT `src/test/useBeechForm.test.ts`,
  `src/test/clienti-form-e2e.test.tsx`, `src/test/BeechForm.test.tsx` (mock schema nella nuova forma).

Dashboard (`apps/dashboard/src/`) — solo ponte di compilazione + rimozione rami morti
- EDIT `lib/tags-utils.ts` (+ `lib/tags-utils.test.ts`).
- EDIT `components/fields/types.ts`, `FieldEdit.tsx`, `edit/select.tsx`, `edit/json.tsx`, `display/json.tsx`.
- EDIT `components/fields/edit/repeater/repeater-branch-options.tsx`, `repeater-branch-item.tsx`.
- EDIT `features/seed-builder/lib/meta-seed-layout.ts`.
- EDIT `features/automations/components/automation-editor/automation-value-input.tsx`, `automation-ops.ts`.
- EDIT `features/content-toolbar/shared.ts`, `features/content-management/hooks/use-content-list-query.ts`.
- EDIT test fixture: `components/fields/json-edit.test.tsx`, `display-fields.test.tsx`, `edit-tags.test.tsx`,
  `features/content-toolbar/test/unit/shared.test.ts`, `test/cross-slice/content-list.test.tsx`,
  `features/seed-builder/test/unit/use-seed-editor-dialog.test.tsx`.

Docs
- NEW  `CHANGELOG.md` (root).
- EDIT `docs/build/schema-modeling.md`, `docs/reference/public-api.md`.

Esclusi esplicitamente: nuova UX dashboard, plan/apply, viste (vedi SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Tipo `TagOption` (`engine/types.ts`)

Sostituisci il blocco `L107-111` e aggiorna il doc di `multiple` (`L101-106`). Verbatim:

```ts
/** One entry of a `tags` branch's closed vocabulary. Array order is significant (menu, kanban columns, sort). */
export interface TagOption {
  /** Stored value and identity. Unique within the branch; compared exactly (case-sensitive, never trimmed). */
  value: string
  /** Presentation-only color, `#RRGGBB`. Lives in the seed only — never persisted in entries. */
  color: string
}

// in Branch:
  /**
   * Cardinality:
   * - `file`: false/undefined → single URL; true → URL list.
   * - `relation`: false/undefined → FK column; true → junction table.
   * - `tags`: undefined/true → multiple choice (default); false → at most one value. The value is always an array.
   */
  multiple?: boolean
  /**
   * Closed vocabulary — valid ONLY on `tags` (any other type is a fatal seed error).
   * When present: non-empty, unique values, `#RRGGBB` colors; written values must be one of the option values.
   * Static seed metadata, never persisted in entries.
   */
  options?: TagOption[]
```

### Task 2 — Modulo `engine/seeds/tag-options.ts` (nuovo)

Perché: unica sorgente delle regole su opzioni/modalità, usata da boot (Task 3), registry (Task 3), validatore
(Task 4), cache/fingerprint/typegen (Task 5-7), kanban (Task 8), API (Task 9) e dashboard (Task 13). Header SPDX MIT
come i vicini (`seed-validation.ts:L1-2`). Export da `index.ts` subito dopo `L89`
(`export * from './engine/seeds/tag-options.js'`).

Firme verbatim:

```ts
/** Accepted option color format: 6-digit hex, the value `<input type="color">` emits. */
export const TAG_OPTION_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** True only for a `tags` branch with `multiple === false`. Omitted `multiple` on `tags` means multiple choice. */
export function isSingleChoiceTags(branch: Pick<Branch, 'type' | 'multiple'>): boolean

/** Option values in declared order; `[]` when the branch has no options. */
export function tagOptionValues(branch: Pick<Branch, 'options'>): string[]

/** The option whose `value` equals `value` exactly, or `undefined`. */
export function findTagOption(branch: Pick<Branch, 'options'>, value: string): TagOption | undefined

/**
 * Seed-definition issues for `options` / `multiple` on this branch AND, recursively, its repeater sub-fields.
 * Pure, never throws, works on untyped input (stored JSON may carry any shape). `[]` = valid.
 */
export function tagOptionsIssues(branch: Branch): string[]
```

Regole di `tagOptionsIssues`, nell'ordine; `<a>` = alias del branch. Per un sub-field il prefisso diventa
`branch '<parent>': sub-field '<sub>': ` al posto di `branch '<a>': `. Messaggi verbatim (sono superficie per MCP,
CLI e seed builder):

1. `options !== undefined` su tipo `text` →
   `branch '<a>': options are not supported on type 'text'. Use type 'tags' with options (add multiple: false for a single choice).`
2. `options !== undefined` su qualsiasi altro tipo ≠ `tags` →
   `branch '<a>': options are only supported on type 'tags' (got '<type>').`
   Dopo 1 o 2 non controllare altro su quel branch.
3. Solo `tags`: `multiple !== undefined && typeof multiple !== 'boolean'` →
   `branch '<a>': multiple must be a boolean.`
4. Solo `tags` con `options !== undefined`: non array oppure array vuoto →
   `branch '<a>': options must be a non-empty array of { value, color } objects.` (stop su questo branch).
5. Per ogni elemento `i` (indice 0-based):
   - stringa → `branch '<a>': option #<i> must be an object { value, color }, not a plain string.`
   - non oggetto plain → `branch '<a>': option #<i> must be an object { value, color }.`
   - `value` non stringa, vuota, o `value !== cleanString(value)` (spazi ai bordi / caratteri di controllo) →
     `branch '<a>': option #<i> value must be a non-empty string without leading or trailing whitespace.`
   - `value` già visto → `branch '<a>': duplicate option value '<value>'.`
   - `color` non stringa o non `TAG_OPTION_COLOR_RE` →
     `branch '<a>': option '<value>' color must be a hex color #RRGGBB (got '<color>').`
     (`<color>` = `String(color)`; per un `value` non valido usa `#<i>` al posto di `'<value>'`).
   Un elemento può produrre più messaggi; tutti i messaggi sono raccolti (nessuno stop) così il seed builder (Sprint 3)
   mostra tutto in un colpo.
6. Ricorsione su `branch.fields ?? []` con le stesse regole.

Invarianti: stesso input → stessi messaggi nello stesso ordine; nessun accesso a seed esterni.
`cleanString` viene da `../validation/primitives.js`.

### Task 3 — Gate di boot

**3a. `validateSeedDefinitions` (`seed-validation.ts`).** Aggiungi dopo Fatal 17 (`L400`) il blocco
`// ── Fatal 18: tags options / cardinality ──`, stessa forma di Fatal 17: per seed, concatena
`tagOptionsIssues(branch)` di ogni branch; se non vuoto → `{ slug, messages, fatal: true }`.

**3b. `SeedRegistry` (`seed-registry.ts:L50-79`).** Dentro il loop sui branch, dopo il controllo duplicati id:
se `tagOptionsIssues(branch)` è non vuoto, lancia
`new Error(\`Seed "${seed.slug}": ${issues[0]}\`)`. Perché qui: è il punto che ogni isolate attraversa
all'idratazione; un DB precedente con `text`+`options` o `options: string[]` fallisce subito con il messaggio che
indica i `tags` (brief §2.1, §2.11), stesso comportamento delle guardie già presenti (`L54-76`).

### Task 4 — Validazione dei valori (`schema-builders.ts:L272-295`, `L444`)

Firma nuova (privata): `function tagsSchema(branch: Branch, options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny`.
Registrazione: `tags: (branch, options) => tagsSchema(branch, options, options.allowNull)`. Aggiorna il docblock
(rimuovi "dedupe").

Regole, in quest'ordine; il primo controllo che fallisce emette **una sola issue per l'array** (path = l'alias, così
`ValidationDetail.field` è `'<alias>'`, non `'<alias>[i]'`):

1. Non array → issue di tipo esistente (zod `invalid_type`). Una stringa nuda **non** viene mai convertita: il dettaglio
   resta `expected 'array'`, `received 'string'` (brief §2.7).
2. Lunghezza > `MAX_TAGS_COUNT` → `Expected tags(max:100)` (esistente).
3. Con opzioni (`tagOptionValues(branch).length > 0`): ogni elemento **così com'è ricevuto** (nessun `cleanString`
   prima del confronto) deve essere uno dei valori → altrimenti
   `Expected tags(one-of:<v1>|<v2>|…)` (valori nell'ordine del seed, separatore `|`). `"Pro"` ≠ `"pro"`,
   `" pro"` ≠ `"pro"`. Output = array ricevuto, invariato.
4. Senza opzioni: comportamento attuale per elemento (`cleanString`, limite `maxTextLength`, vuoti scartati).
5. Duplicati (sul risultato di 3 o 4) → `Expected tags(unique)`. **Nessuna deduplicazione**: rimuovi il `new Set`
   di `L293`.
6. `isSingleChoiceTags(branch)` e lunghezza > 1 → `Expected tags(max:1)`.

Implementazione: `z.array(z.string())` → `.max(...)` → `.transform` che normalizza (solo ramo 4) → `.superRefine`
che applica 3/5/6 in ordine e si ferma alla prima violazione; avvolto da `withEmptyPreprocessing` come oggi.
Obbligatorietà invariata: `detectMissingRequired` già rifiuta `[]` su branch obbligatorio → singola+obbligatoria
= esattamente 1; multipla+obbligatoria = almeno 1. Valori obsoleti: rifiutati in scrittura come ogni valore fuori
elenco; le letture non passano dal validatore e restano indulgenti (nessuna modifica).

Stringhe `expected` risultanti (contratto per test e client): `tags(one-of:low|high)`, `tags(unique)`,
`tags(max:1)`, `tags(max:100)`, `array`.

### Task 5 — Chiave cache (`cache.ts:L61-109`)

`BranchFingerprint`: aggiungi `o: string[] | null` (doc: "Option values in declared order, or null"), valorizzato
`branch.options ? tagOptionValues(branch) : null`. `m` diventa la cardinalità **risolta**:
`branch.type === 'tags' ? !isSingleChoiceTags(branch) : branch.multiple === true` (oggi `multiple: false` e omesso
collidono sulla stessa chiave ma su `tags` producono schemi diversi). Il colore resta fuori: il validatore non lo usa.

### Task 6 — Fingerprint di schema (`schema-fingerprint.ts`)

- `SCHEMA_FINGERPRINT_VERSION = 2` (`L28`): la proiezione cambia (modalità risolta sui `tags`), quindi due build non
  sono più confrontabili.
- `ContractBranch.options?: string[]` resta (valori). In `projectBranch` (`L69-90`):
  - `options`: `...(branch.options !== undefined ? { options: tagOptionValues(branch) } : {})` — l'ordine resta parte
    del contratto (unione e menu).
  - `multiple`: sui `tags` sempre presente = `!isSingleChoiceTags(branch)` (omesso e `true` producono lo stesso hash);
    sugli altri tipi invariato (spread se definito).
- Aggiungi alla lista "Deliberately EXCLUDED" (`L95-104`): `option color — presentation only; a color edit cannot
  change a response byte.` Il colore è coperto dal diff di plan/apply (Sprint 2).

### Task 7 — Generatore di tipi (`seed-types-generator.ts:L42-53`)

`text` (e `richtext`/`file`) → sempre `string` (rimuovi il ramo `branch.type === 'text' && branch.options?.length`).
`tags` → `(${literalUnion(tagOptionValues(branch))})[]` se ci sono opzioni, altrimenti `string[]`. Singola e multipla
producono lo stesso tipo (il dato è sempre array, brief §2.7).

### Task 8 — Kanban core (`kanban.ts`)

Perché ora: il ramo `text` legge `options` come stringhe e non compila; inoltre `text`+`options` non può più esistere.
- `KanbanAxisBranchType = 'tags' | 'boolean'` (`L8`).
- `isAxisCandidate`: elimina `L56` (un `text` cade sul `return null` finale).
- `resolveKanbanColumns`: elimina il ramo `text` (`L97-98`); per `tags` usa `tagOptionValues(branch)` se non vuoto,
  altrimenti `distinctTagValues` ordinati (invariato). `label` = `value` (invariato; colore colonna = Sprint 4).
- Restrizione "solo tag singoli come asse" **non** qui: Sprint 4.
- Config persistite con asse `text`: azzerate da `cleanKanban` (`content-view.ts:L239-248`), nessuna modifica.

### Task 9 — Schema pubblico (`public-routes.ts:L49-60`)

Rimuovi il cast `rawBranch` per `options`. Ogni branch pubblico emette:

| Chiave | Valore | Quando |
|--------|--------|--------|
| `options` | `Array<{ label: string; value: string; color: string }>` con `label = value` | `branch.options` definito |
| `multiple` | `boolean` = `!isSingleChoiceTags(branch)` | solo `type === 'tags'` |

`placeholder` / `helpText` restano letti come oggi. `label = value` mantiene compatibile `@beechcms/forms-react`
(che legge `label`).

### Task 10 — `@beechcms/forms-react`

- `types.ts` (`FormBranchSchema`, `L35-46`): `options?: Array<{ label: string; value: string | number; color?: string }>`
  e nuovo campo `arrayValue?: boolean` — doc: "True for `tags` branches: the value is submitted as `string[]`."
- `useBeechForm.ts` adattatore (`L85-118`): `arrayValue: typeStr === 'tags'`; il resto invariato (un `tags` con
  opzioni resta `type: 'select'`, un `tags` libero resta input stringa).
- Payload (`L365-370`): per i branch con `arrayValue`, `undefined | null | ''` → `[]`, stringa → `[stringa]`,
  array → invariato. Nessun altro branch cambia. Limite noto e accettato: i `tags` multipli nel form pubblico
  offrono una sola scelta (nessuna nuova UI nel SDK).

### Task 11 — Seed demo (`apps/api/src/shared/db/fixtures/`)

- `demo-seeds.ts`: unica sorgente. Riscrivi i 7 branch di scelta con `multiple: false`, `options: TagOption[]`;
  id, alias, label, `requiredOnCreate/Update` invariati. Valori e colori (decisi qui, verbatim):

| Seed.branch | id | options (`value` → `color`) |
|-------------|----|-----------------------------|
| `clienti.tier` | `br_c4` | free `#64748b`, pro `#3b82f6`, enterprise `#8b5cf6` |
| `clienti.account_status` | `br_c5` | active `#10b981`, churned `#ef4444` |
| `abbonamenti.billing_cycle` | `br_a3` | monthly `#06b6d4`, annual `#8b5cf6` |
| `abbonamenti.payment_status` | `br_a4` | active `#10b981`, past_due `#f59e0b`, canceled `#ef4444` |
| `ticket.priority` | `br_t3` | low `#64748b`, medium `#f59e0b`, high `#ef4444` |
| `ticket.category` | `br_t4` | billing `#06b6d4`, technical `#3b82f6`, sales `#ec4899` |
| `ticket.ticket_status` | `br_t5` | open `#3b82f6`, in_progress `#f59e0b`, closed `#10b981` |

- DELETE `demo-seeds.fixtures.ts` (copia identica = sorgente di drift). In `features/setup/index.ts` rimuovi
  l'import `L13` e usa `DEMO_SEED_DEFINITIONS` a `L268`.
- `demo-data.fixtures.ts`: nessuna modifica attesa (valori già array e già nelle opzioni); il test esistente
  `validate-all-demo-data.test.ts:L11` ne è la guardia — se fallisce, correggi il dato, non il test.

### Task 12 — Seed canonico (`packages/testing/src/seeds/canonical.seeds.ts`)

Aggiungi in coda a `posts.branches` (`L47`), verbatim:

```ts
{ id: 'br_11', alias: 'priority', label: 'Priority', type: 'tags', multiple: false,
  options: [{ value: 'low', color: '#64748b' }, { value: 'high', color: '#ef4444' }] },
```

Non obbligatorio, policy di default (pubblico). Serve ai test integration (Rule 3.5: fixture canonici).

### Task 13 — Ponte di compilazione dashboard (nessuna nuova UX)

Regola generale: ogni lettura di `branch.options` passa da `tagOptionValues` / `findTagOption` (`@beechcms/core`);
nessun colore inventato o posizionale; i rami che gestivano `text`/`json` con opzioni vengono **eliminati** (non
possono più esistere, Fatal 18).

1. `lib/tags-utils.ts`: elimina `TAG_PALETTE`. Nuove firme:
   `export const NEUTRAL_TAG_COLOR = "#64748b"` e
   `export function colorForOption(tag: string, branch: Pick<Branch, "options">): string | undefined`
   → `findTagOption(branch, tag)?.color`. Il colore non dipende più dalla posizione.
2. `components/fields/edit/json.tsx` (`L39-75`): `hasOptions` ora implica `type === 'tags'`; elimina `storesArray`
   e il ramo mappa `{tag: color}` dentro il blocco opzioni; colori da `colorForOption(tag, branch) ?? NEUTRAL_TAG_COLOR`;
   `toggleTag` emette sempre `string[]`; `predefinedOptions = tagOptionValues(branch)`. Il ramo editor JSON
   (CodeMirror) resta com'è.
3. `components/fields/display/json.tsx` (`L49-55`): `colorForOption(chip.label, branch)`.
4. `components/fields/FieldEdit.tsx`: elimina il blocco `L30-34` (e il commento `L30`) e l'import di `BranchType` se
   inutilizzato; `text` va al suo renderer, `tags` a `JsonEdit`, il meta-seed `select` passa già da
   `getEditComponent(type)`.
5. `components/fields/types.ts`: aggiungi, verbatim:
   ```ts
   /** Dashboard-only branch of the seed-builder meta-seed: a single-value select over a plain vocabulary. Never persisted. */
   export type MetaSelectBranch = Branch & { selectOptions?: readonly string[] }
   ```
6. `components/fields/edit/select.tsx`: legge `(branch as MetaSelectBranch).selectOptions ?? []` invece di
   `branch.options`; doc aggiornato ("meta-seed only").
7. `features/seed-builder/lib/meta-seed-layout.ts`: `L58-61` e `L92-93` usano `selectOptions` al posto di `options`;
   entrambi i literal con cast `as MetaSelectBranch as Branch` (o equivalente) come già fa `L62`.
8. `components/fields/edit/repeater/repeater-branch-options.tsx`: elimina `TagsOptionsForm` + `TagsOptionsFormProps`
   (`L263-293`); `repeater-branch-item.tsx`: rimuovi import (`L24`) e render (`L288-290`). Motivo: scrive
   `options: string[]`, forma che il boot ora rifiuta. L'editor nuovo è Sprint 3. Le chiavi i18n
   `seedBuilder.branchEditor.options*` restano.
9. `features/automations/.../automation-value-input.tsx`: elimina il ramo `text`+opzioni (`L91-104`); nel ramo
   `tags` (`L106`) la condizione diventa solo `branch.type === 'tags'` e le voci sono `tagOptionValues(branch)`.
10. `features/automations/.../automation-ops.ts`: elimina `TEXT_OPTIONS_OPS` (`L9`); `case 'text': return TEXT_OPS`.
11. `features/content-toolbar/shared.ts`: elimina il ramo `L222-223` (un `text` cade in `"other"` al ramo seguente).
12. `features/content-management/hooks/use-content-list-query.ts:L150`: `new Set<string>()` (un `json` non può
    avere opzioni).

Fixture di test dashboard: dichiarazioni `options` passano alla forma `TagOption[]` su branch `tags`; i casi che
asserivano comportamento di `text`/`json` con opzioni vengono **cancellati** (comportamento rimosso dal brief §2.1),
non riscritti. `use-seed-editor-dialog.test.tsx:L102` legge `.selectOptions`.

### Task 14 — Documentazione e nota di rottura

- NEW `CHANGELOG.md` (root, primo file del genere). Una sezione `## Unreleased — BREAKING`, che dichiara:
  `options` valido solo su `tags`, forma `[{ value, color }]` con colore `#RRGGBB` obbligatorio, elenco vincolante
  (400 fuori elenco/duplicati/oltre cardinalità); `multiple: false` = scelta singola, dato sempre array;
  `text`+`options` e `options: string[]` rifiutati al boot; **nessuna migrazione: ripartire da un DB nuovo**
  (`pnpm beech db:reset`), riscrivere i seed nella nuova forma; `X-Schema-Revision` passa a `v2:` → rigenerare i tipi
  client; migrazione dati rimandata alla 0.9.
- `docs/build/schema-modeling.md`: riga `multiple` (`L91`) aggiunge `tags`; riga `options` (`L92`) nuova forma e
  vincolo; riga tipo `text` (`L108`) senza esempio `options`; riga `tags` (`L114`) con esempio `TagOption` e
  `multiple: false`; esempio JSON `L292-293` nella nuova forma.
- `docs/reference/public-api.md`: esempio `X-Schema-Revision` (`L396`) con prefisso `v2:`; documenta le chiavi
  `options`/`multiple` della risposta `GET /:seed/schema` secondo la tabella del Task 9.

### Task 15 — Test (behaviour list)

Tutti: header SPDX (MIT in `packages/core`, BUSL nelle app — copia il file vicino), `it()` = comportamento + esito,
nessun `should`, nessun `any`.

**`packages/core/src/engine/seeds/tag-options.test.ts`** — unit, fixture: oggetti `Branch` costruiti a mano (input
deliberatamente malformati, Rule 3.5 eccezione ammessa).
- `isSingleChoiceTags` è true solo per `tags` con `multiple: false` (matrice: tags omesso/true/false, relation false).
- `tagOptionValues` restituisce i valori nell'ordine dichiarato e `[]` senza opzioni.
- `findTagOption` trova solo il valore esatto: `'pro'` sì, `'Pro'` e `' pro'` no.
- `tagOptionsIssues` restituisce il messaggio atteso per ogni seed malformato (matrice: text+options, number+options,
  `[]`, stringa nuda, valore duplicato, colore `red`/`#fff`/assente, valore `' pro'`, `multiple: 'yes'`, sub-field di
  repeater text+options col prefisso).
- `tagOptionsIssues` restituisce `[]` per tags singolo, multiplo e libero validi.

**`seed-validation.test.ts`** — unit, aggiungi:
- un seed con opzioni su `text` produce un'issue fatal il cui messaggio indica `tags` come sostituto.
- un set con un seed valido e uno con opzioni malformate segnala fatal solo lo slug malformato.

**`seed-registry.test.ts`** — unit, aggiungi:
- il costruttore lancia quando un seed memorizzato dichiara opzioni su un branch `text`.
- il costruttore lancia quando le opzioni dei tags sono `string[]`.

**`engine/validation/index.test.ts`** (`validateAndSanitizeSeedPayload`) — unit, fixture: seed costruito con il branch
di Task 12 (stessa forma).
- un valore fuori elenco produce `{ field: 'priority', expected: 'tags(one-of:low|high)' }` e nessun `data`.
- `['High']` e `[' high']` sono rifiutati con `tags(one-of:…)` (confronto esatto, nessun trim).
- `['low','low']` è rifiutato con `tags(unique)` invece di essere deduplicato.
- un tags libero con `['a','a']` è rifiutato con `tags(unique)`.
- un tags singolo con due valori distinti è rifiutato con `tags(max:1)`.
- un tags singolo obbligatorio con `[]` in creazione è rifiutato dal controllo required esistente.
- la stringa nuda `'low'` è rifiutata con `expected 'array'` e `received 'string'` (nessuna coercizione).
- un tags multiplo con opzioni accetta più valori distinti e li restituisce nell'ordine ricevuto.
- un tags libero accetta qualsiasi valore e continua a fare trim e a scartare le stringhe vuote.

**`cache.test.ts`** — unit, aggiungi:
- compila schemi distinti quando cambiano i valori delle opzioni o quando `multiple` passa da omesso a `false` su un tags.

**`schema-fingerprint.test.ts`** — unit, aggiorna `L99` a prefisso `v2`; aggiungi:
- il fingerprint non cambia modificando il colore di un'opzione.
- il fingerprint cambia aggiungendo, rimuovendo o riordinando un valore di opzione.
- il fingerprint cambia quando un tags passa da multiplo a singolo; `multiple` omesso e `true` producono lo stesso fingerprint.

**`seed-types-generator.test.ts`** — unit: elimina "text with options → literal union" (`L30-32`); aggiorna `L33-35`
alla forma `TagOption` → `('x' | 'y')[]`; aggiungi: un tags singolo con opzioni genera lo stesso array di unione del multiplo.

**`kanban.test.ts`** — unit: fixture `text`+opzioni riscritte come `tags` con `TagOption` dove il comportamento esiste
ancora (colonne in ordine opzioni, "Senza" solo se non obbligatorio, localizzato escluso); elimina "accepts text branch
with options as candidate" (`L37`) e "text axis with options" (`L119`); aggiungi: un `text` non è mai candidato asse.

**`content-view.test.ts`** — unit: fixture `L28` diventa `tags`, `multiple: false`, `TagOption[]`; nessun nuovo caso.

**`apps/api/src/features/content/test/integration/content-tag-options.integration.test.ts`** — integration (harness,
D1 reale, `__resetSeedRegistryCache`, canonico `posts.br_11 priority`, `admin` via `harness.asUser('admin')`).
`describe('content slice — integration (real D1)')`, nested `POST /api/content/:slug` e `PUT /api/content/:slug/:id`.
- POST con `priority: ['high']` risponde 201 e la GET dell'entry restituisce `['high']`.
- POST con `priority: ['urgent']` risponde 400 `content-validation-failed`, `errors[0]` = `priority` /
  `tags(one-of:low|high)`, e il conteggio di `posts` resta invariato.
- POST con `priority: ['low','high']` risponde 400 `tags(max:1)` e nulla viene persistito.
- POST con `priority: 'low'` risponde 400 con `expected 'array'` e nulla viene persistito.
- PUT con `tags: ['a','a']` risponde 400 `tags(unique)` e la riga salvata resta quella precedente.
Commento obbligatorio (Rule 6.2.3): la lettura indulgente di un valore obsoleto non è coperta qui perché scriverlo
richiede di nominare la colonna fisica (Rule 3.7); le letture non passano dal validatore.

**`apps/api/src/public/test/integration/public-schema.integration.test.ts`** — integration (harness, canonico).
`describe('public slice — integration (real D1)')`, nested `GET /api/v1/public/:seed/schema`.
- `posts.priority` espone `options` `[{ label: 'low', value: 'low', color: '#64748b' }, { label: 'high', … }]` e
  `multiple: false`.
- il tags libero `posts.tags` espone `multiple: true` e nessuna chiave `options`.

**`apps/api/test/validate-all-demo-data.test.ts`** — unit, aggiungi:
- ogni seed demo supera `validateSeedDefinitions` senza issue fatal.

**`packages/forms-react/src/test/useBeechForm.test.ts`** — unit (mock del `fetch`, come i test esistenti):
- invia l'opzione scelta di un branch `tags` come array di un elemento e una scelta vuota come `[]`.
`clienti-form-e2e.test.tsx` / `BeechForm.test.tsx`: mock schema nella forma del Task 9 (`type: 'tags'`,
`multiple: false`, `options` con `color`); asserzioni sulle `<option>` invariate.

**Dashboard** — unit, `// @vitest-environment` come i file esistenti.
- `lib/tags-utils.test.ts`: `colorForOption` restituisce il colore dichiarato; `undefined` per un valore assente;
  riordinare le opzioni non cambia il colore di un valore.
- `components/fields/json-edit.test.tsx`: aggiungi — il chip di un'opzione selezionata usa il colore dichiarato
  nell'opzione.
- `components/fields/display-fields.test.tsx`: aggiungi — il display tags colora i chip da `option.color`.
- `edit-tags.test.tsx`, `content-toolbar/test/unit/shared.test.ts` (il caso `text` con opzioni diventa: un `text`
  finisce nella sezione `other`), `test/cross-slice/content-list.test.tsx` (rimuovi `options` dal branch `json`),
  `use-seed-editor-dialog.test.tsx` (`selectOptions`): solo aggiornamento fixture.
Nessun test nuovo per `automation-ops` / `automation-value-input`: rimuovono solo rami ora irraggiungibili (coperti
dal type-check).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Exit code 0 per tutti, in ordine:

```bash
pnpm --filter @beechcms/core run type-check
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/testing run type-check
pnpm --filter @beechcms/api run type-check
pnpm --filter @beechcms/forms-react run type-check
pnpm --filter @beechcms/forms-react test
pnpm --filter @beechcms/dashboard run type-check
pnpm run type-check            # turbo: cattura ogni altro consumatore (cli, mcp, client)
pnpm beech test                # suite completa, api integration (D1 reale) inclusa
pnpm run lint
pnpm run lint:tests            # placement dei test (testing_conventions §1)
pnpm beech db:reset && pnpm beech onboard --yes   # DB nuovo: i seed demo superano il boot e i fixture si caricano
```

Controllo manuale finale: `pnpm beech dev`, aprire una entry `clienti` → `tier` caricato come chip col colore
dichiarato; salvare senza modifiche → 200.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Hotfix del working tree committato prima dell'inizio (baseline).
- [ ] `TagOption` esportato da `@beechcms/core`; `Branch.options?: TagOption[]`; nessun `options: string[]` residuo in
      `apps/` e `packages/` fuori da `MetaSelectBranch.selectOptions` (`grep -rn "options: \['" apps packages` vuoto,
      esclusi `node_modules`/`dist` e opzioni di librerie non-Branch).
- [ ] `tag-options.ts` è l'unica implementazione delle regole su opzioni/modalità; `seed-validation.ts`,
      `seed-registry.ts`, `schema-builders.ts`, `cache.ts`, `schema-fingerprint.ts`, `seed-types-generator.ts`,
      `kanban.ts`, `public-routes.ts` e la dashboard la importano, nessuno la riscrive.
- [ ] `tag-options.ts` non importa nulla oltre a `../types.js` e `../validation/primitives.js` (zero dipendenze nuove).
- [ ] Un seed con `text`+`options`, `options: string[]`, `options: []`, valori duplicati o colore non `#RRGGBB` è fatal
      in `validateSeedDefinitions` e fa lanciare `new SeedRegistry(...)`.
- [ ] Scrittura: fuori elenco → 400 `tags(one-of:…)`; duplicati → 400 `tags(unique)` (nessuna dedup silenziosa);
      singolo con 2+ valori → 400 `tags(max:1)`; stringa nuda → 400 `expected 'array'`; confronto esatto.
- [ ] `SCHEMA_FINGERPRINT_VERSION === 2`; il colore non entra nel fingerprint; valori e modalità sì.
- [ ] `KanbanAxisBranchType` non contiene più `'text'`.
- [ ] `GET /api/v1/public/:seed/schema` espone `options: {label,value,color}[]` e `multiple` sui `tags`.
- [ ] forms-react invia `string[]` per ogni branch `tags`.
- [ ] `demo-seeds.fixtures.ts` eliminato; `DEMO_SEED_DEFINITIONS` unica sorgente; 7 branch di scelta `multiple: false`
      con i colori della tabella del Task 11; onboarding su DB nuovo verde.
- [ ] Dashboard: `TAG_PALETTE` e `TagsOptionsForm` eliminati; `FieldEdit` non instrada più su `options`; nessun colore
      posizionale.
- [ ] `CHANGELOG.md` con nota BREAKING (DB nuovo, nuova forma, fingerprint v2, migrazione rimandata alla 0.9);
      `schema-modeling.md` e `public-api.md` aggiornati.
- [ ] Tutti i comandi della SECTION 5 a exit 0; nessun `it.skip`/`it.only`; test conformi a `testing_conventions.md`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

L'executor NON deve:

- Toccare `packages/cli/src/lib/manifest-compare.ts`, `commands/schema-plan.ts`, `commands/schema-apply.ts`,
  `lib/control-plane.ts`, `packages/mcp/src/plans.ts`, né la risposta di `POST /api/seeds/:slug/mcp-plan`
  (diff di sola definizione, normalizzazione `multiple` dei tags) → ROADMAP §2 `SchemaPlanDefinitionDiff`.
- Costruire UX: dropdown con pallino colore, chip singolo/multiplo nell'editor, chip grigio "non presente nelle
  opzioni", chip neutro per tag liberi, rimozione dell'interpretazione colore/hex in `extractTagChips`, editor
  opzioni + interruttore singolo/multiplo nel seed builder → ROADMAP §3 `TagChoiceEditing`.
- Limitare l'asse kanban ai tag singoli, aggiungere colore alle colonne, cambiare `kanban-move.ts`, ordinare per
  posizione opzione in `buildSelectQuery`, rifiutare config di vista su tag multipli (`views.ts`,
  `validateViewConfigAgainstSeed`), cambiare toolbar ordinamento/raggruppamento, formattazione condizionale o
  `when-evaluator.ts` → ROADMAP §4 `TagChoiceViews`.
- Toccare `d1-widget.repository.ts` o `demo-data.fixtures.ts` oltre a quanto il test di guardia imponga (baseline
  hotfix).
- Scrivere migrazioni D1, compat layer per `options: string[]`, coercizione stringa→array lato server, palette di
  ripiego per colori mancanti (brief §5).
- Rigenerare a mano `docs/api/**` (TypeDoc generato) o bumpare versioni di pacchetto.
