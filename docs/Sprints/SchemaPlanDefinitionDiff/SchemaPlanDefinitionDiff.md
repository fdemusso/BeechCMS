# Sprint: SchemaPlanDefinitionDiff

Serie: `stages/01_sprint_planning/output/backlog/ROADMAP.md` — Sprint 2 di 4 (**NEXT**).
Brief: `stages/00_ideation/output/feature_brief.md` (user story "operatore o agente (CLI e MCP)", §4 "Impatto su
componenti trasversali"). Sprint precedente: `docs/Sprints/TagOptionsContract/` (PASS).

### Pre-Computation Analysis

**a) God Nodes (graphify CLI)**

| Nodo | Sorgente | Grado | Perché conta |
|------|----------|-------|--------------|
| `Seed` | `packages/core/src/engine/types.ts:L239` | 250 | È il candidato del plan e la definizione salvata: il diff lavora su due `Seed`. |
| `Branch` | `packages/core/src/engine/types.ts:L85` | 74 | Unità del diff (`options`, `multiple`, flag); identità = `id` (`br_XX`). |
| `isSingleChoiceTags` | `packages/core/src/engine/seeds/tag-options.ts` | 10 | Già usato da fingerprint, cache, `tagsSchema`: regola unica "omesso ≡ multiplo" da riusare. |

Nodi locali della feature (grado basso, ma sono il perimetro): `McpPlan` (`control-plane.ts:L26`, 4),
`classifyCandidate` (`seeds.mcp.ts:L80`, 3), `compareManifest` (`manifest-compare.ts:L85`, 5),
`normalizeCandidate` (`seeds.mcp.ts:L25`, 1).

Limite del grafo: il legame CLI → API passa via HTTP (`client.request('POST', '/api/seeds/:slug/mcp-plan')`), non via
import; `McpPlanResponse` (`packages/mcp/src/index.ts:L74`) è privato e non ha archi. Per quei punti, simbolo noto →
lookup diretto (`tooling_graphify.md`, euristica).

**b) Confini architetturali toccati**

- `@beechcms/core`
  - `engine/seeds/seed-definition-diff.ts` (nuovo) — forma confrontabile di seed/branch + diff per `id`. Vive in
    `engine/` (non in `schema/`): lo importa il Worker, e `schema/` è il modulo che il Worker non importa mai
    (`common/canonical-json.ts:L10-12`).
  - `index.ts` — export.
- `apps/api` — solo slice `features/seeds`: `seeds.mcp.ts` (risposta `mcp-plan` + dettaglio audit `mcp-apply`).
- `packages/cli` — `lib/control-plane.ts` (`McpPlan`), `commands/schema-plan.ts`, `commands/schema-apply.ts`,
  `lib/manifest-compare.ts` (delega la normalizzazione al core).
- `packages/mcp` — `src/index.ts` (`McpPlanResponse` + descrizione tool). `src/plans.ts` **non** cambia (vedi Task 6).
- `apps/dashboard` — **nessuna modifica**.
- Docs: `docs/reference/seed-builder.md`, `docs/reference/mcp-server.md`, `docs/build/schema-modeling.md`,
  `docs/build/cli-workflows.md`, `docs/build/schema-manifest.md`, `CHANGELOG.md`.

**c) `graphify affected` (depth 2) — prova di controllo delle rotture**

```
affected McpPlan            → schema-apply.ts, schema-plan.ts, cli/src/index.ts (re-export),
                              schema-apply.test.ts, schema-plan.test.ts
affected renderPlan         → schemaApply(), schemaPlan(), cli/src/index.ts, schema-apply.test.ts, schema-plan.test.ts
affected compareManifest    → schemaDiff() (commands/schema-diff.ts:L44), manifest-compare.test.ts,
                              schema-diff.test.ts:L184, cli/src/index.ts
affected normalizeBranch    → normalizeSeed(), canonicalize() (solo manifest-compare.ts, privati)
affected classifyCandidate  → seeds.handler.ts:L331 (re-export), seeds/index.ts, seeds.test.ts  [non modificato]
affected McpPlanResponse    → No affected nodes found (interfaccia privata di packages/mcp/src/index.ts)
affected isSingleChoiceTags → projectBranch(), buildBranchFingerprint(), tagsSchema()  [solo nuovo consumatore]
path schemaApply → planExtendSeed → No directed path (la CLI non pianifica DDL in locale: conferma il confine)
```

Rotture attese e gestite: `McpPlan` acquista due campi obbligatori → i mock di `schema-plan.test.ts` e
`schema-apply.test.ts` vanno aggiornati (Task 8). `compareManifest` cambia semantica solo per `multiple` omesso sui
`tags` (Task 5); `schema-diff.test.ts:L184` usa branch `text`, invariato.

**Scoperta che corregge il ROADMAP (§2).** Il ROADMAP afferma che un cambio di sole opzioni "stampa (no change) e
non viene applicato". Il codice dice il contrario: `planExtendSeed` (`engine/ddl/seed-ddl.ts:L97`) aggiunge **sempre**
`generateIndexes(seed)` (`ddl.ts:L317-340`, minimo 2 `CREATE INDEX IF NOT EXISTS`), quindi `statements` non è mai
vuoto per un seed esistente. Effetto reale oggi:
- `beech schema plan` non stampa mai "(no change)" / "Nothing to apply" per un seed esistente: elenca indici
  idempotenti e conta ogni seed come "ready to apply";
- `beech schema apply` riapplica **ogni** seed del manifest a ogni run (upsert + bump di `registry_version`), quindi
  un cambio di opzioni viene scritto — ma il piano non lo mostra mai: l'operatore approva DDL idempotente senza vedere
  il cambio che sta per scrivere;
- il controllo "plan changed between review and apply" (`schema-apply.ts:L97`) confronta solo DDL.
Il bisogno del brief ("rilevino come differenza … visibili e tracciabili") resta identico; cambia il criterio: la
CLI non può decidere su `statements` (doc `McpPlan.statements`: "Displayed, never parsed"), quindi decide il server
con un booleano `definitionChanged`. Il ROADMAP viene aggiornato di conseguenza.

### VETO Audit

- **YAGNI.** Un modulo core puro, due campi nella risposta di `mcp-plan`, un campo nell'audit. Nessuna tabella,
  nessuna migrazione D1, nessun nuovo endpoint, nessun nuovo flag CLI. Niente diff "ricco" (prima/dopo per chiave):
  la CLI mostra alias, la verità resta la definizione. `plans.ts` del MCP non cambia: `beech_schema_apply` non filtra
  su `statements`, quindi applica già i cambi di sola definizione; il tool di plan inoltra la risposta intera
  (`...data`, `index.ts:L296`). Il "drift fisico" (colonna mancante con definizione invariata) è compito di
  `beech schema diff` / `diffSeed` (`lib/schema-diff.ts`), non del plan: niente parsing di DDL.
- **Botanical Invariant.** Il diff è in `@beechcms/core` e accoppia i branch per `id` (`br_XX`), come
  `classifyCandidate`; nessun nome di campo cablato. Nessuna query D1 nuova: `mcp-plan` legge già `repo.get(slug)`;
  tutte le scritture restano `repo.applyAtomic` (`seeds.mcp.ts:L294`). La CLI non apre D1 né costruisce SQL
  (`path schemaApply → planExtendSeed`: nessun percorso).
- **Regola unica.** La forma confrontabile (id esclusi, flag omessi ≡ `false`, `multiple` dei `tags` omesso ≡ `true`)
  ha un solo produttore — il core — usato sia dal server (`mcp-plan`) sia da `beech schema diff`
  (`manifest-compare.ts`). Oggi la CLI ha la sua copia (`manifest-compare.ts:L37-73`) che sbaglia sui `tags`: viene
  eliminata, non corretta in loco.
- **VSA.** API: solo `features/seeds/seeds.mcp.ts`, che importa da `@beechcms/core` e dai propri helper. Nessun import
  tra feature. CLI e MCP sono pacchetti, fuori dagli slice.
- **Cloudflare purity.** Codice puro, `canonicalStringify` già usato dal Worker per il fingerprint. Nessun job.
- **Esito:** nessuna violazione. Piano approvato.

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Dallo Sprint 1 le opzioni dei `tags` sono metadati vincolanti (`TagOption[]`, `multiple: false` = scelta singola):
cambiarle cambia cosa il server accetta in scrittura, ma non produce DDL (la colonna resta `TEXT`). Il control plane
(CLI `beech schema plan|apply`, MCP `beech_schema_plan|apply`) oggi ragiona solo in DDL: un operatore che rivede un
piano vede indici idempotenti e non vede il cambio di vocabolario che sta per scrivere; ogni `apply` riscrive ogni
seed anche quando nulla è cambiato. Gli sprint 3 (seed builder) e 4 (viste) aggiungono altri cambi di sola
definizione: il plan deve vederli prima che diventino comuni.

Indipendente dagli Sprint 3/4 (nessun file in comune) e dipendente solo dallo Sprint 1 (`isSingleChoiceTags`, forma
`TagOption`).

- **Botanical Engine:** il criterio "è cambiato?" è una funzione pura del core, non della CLI né del MCP.
- **VSA:** l'API cambia solo nello slice `seeds`; la dashboard non è toccata.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondizione.** Lo Sprint 1 è PASS ma **non committato** su `feature/tag-options-contract` (review report: "no
commits", file untracked: `CHANGELOG.md`, `tag-options.ts`, `tag-options.test.ts`, due integration test). L'executor
parte solo dopo che lo Sprint 1 è committato (e mergiato su `devs`, o con questo sprint ramificato da quel commit).

**API — `POST /api/seeds/:slug/mcp-plan`** (`apps/api/src/features/seeds/seeds.mcp.ts:L123-188`)
- `storedDef` = definizione attiva o `null` (`L141-142`); `candidate = normalizeCandidate(rawCandidate, storedDef)`
  (`L143`): riempie solo gli `id` **mancanti** per alias, e `displayNameAlias`.
- `classifyCandidate(storedDef, candidate)` (`L80-105`): per `id`; drop / rename / retype / relazione → `destructive`.
- `statements`: `planCreateSeed` se la tabella non esiste, altrimenti `planExtendSeed(...).statements` (`L160-170`),
  sempre ≥ 2 `CREATE INDEX IF NOT EXISTS` per un seed esistente (`seed-ddl.ts:L97`, `ddl.ts:L320-323`).
- Risposta (`L174-187`): `slug, classification, requiresConfirmation, applicable, blockedReasons, statements,
  ftsRebuildNeeded, expectedVersion, issues, source`. Nessuna informazione sulla definizione.

**API — `POST /api/seeds/:slug/mcp-apply`** (`L208-356`)
- Stesso `normalizeCandidate` (`L249`); DDL ripianificato (`L277-289`); `repo.applyAtomic({ definition: candidate,
  ddl, … })` (`L294`) scrive definizione + DDL + bump versione in un batch: con `ddl` solo idempotente la definizione
  viene comunque scritta. Audit `activityLogger.log` (`L336-353`): `op, planId, classification, source,
  expectedVersion, newVersion, ddlCount, ftsRebuilt, outcome` — nessuna traccia di cosa è cambiato.

**CLI** (`packages/cli/src/`)
- `lib/control-plane.ts:L26-40` — `McpPlan` = risposta verbatim di `mcp-plan`.
- `commands/schema-plan.ts` — `renderPlan` (`L68-90`) stampa issues, blockedReasons, ogni statement, `(no change)` se
  `statements.length === 0 && applicable` (`L88`, irraggiungibile per seed esistenti); riepilogo su
  `statements.length > 0` (`L56-61`).
- `commands/schema-apply.ts` — `pending` = `statements.length > 0` (`L63`); `applyOne` (`L88-105`) ripianifica e
  aborta se `statements` differiscono (`L97-102`).
- `lib/manifest-compare.ts:L37-73` — copia locale della normalizzazione: `SEED_FLAGS`, `BRANCH_FLAGS` (incl.
  `multiple`, omesso ≡ `false` per **ogni** tipo: sbagliato sui `tags`), `normalizeSeed`, `normalizeBranch` (id
  esclusi ricorsivamente, chiavi sconosciute copiate). Usata da `compareManifest` (`beech schema diff`).
- Candidati dalla CLI: `manifestToSeeds` (`core/src/schema/manifest-seeds.ts:L22-33`) conia `id` locali per i branch
  senza id; `normalizeCandidate` non li sovrascrive (vedi SECTION 7).

**MCP** (`packages/mcp/src/index.ts`)
- `McpPlanResponse` (`L74-93`, privato, senza `source`). `beech_schema_plan` (`L284-297`) salva il piano e restituisce
  `{ planId, ...data, expiresInSeconds }`: ogni campo nuovo della risposta arriva già all'agente.
- `beech_schema_apply` (`L299-328`) non guarda `statements`: applica sempre il piano salvato.
- Descrizione tool `beech_schema_plan` (`L131`) parla solo di DDL.

**Core** (riusabile, nessuna modifica)
- `canonicalStringify` (`common/canonical-json.ts:L83`): chiavi ordinate, `undefined` scartati, ordine array
  preservato; esportato da `index.ts:L27`.
- `isSingleChoiceTags` (`engine/seeds/tag-options.ts`): `true` solo per `tags` con `multiple === false`.

**Test esistenti toccati**: `packages/cli/src/test/schema-plan.test.ts`, `schema-apply.test.ts`,
`manifest-compare.test.ts`; `apps/api/src/features/seeds/seeds.test.ts` (unit, `describe('POST /:slug/mcp-plan')`
`L1289`, `describe('POST /:slug/mcp-apply')` `L1427`, audit `L1569-1588`); integration
`features/seeds/test/integration/seed-ownership.integration.test.ts` (pattern plan → apply su D1 reale, `L136-183`).
I test core non possono importare `@beechcms/testing` (dipendenza circolare, `content-view.test.ts:L19`).

Nessun context variable (`AppEnv.Variables`) né ordine middleware cambia in questo sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Core (`packages/core/src/`)
- NEW  `engine/seeds/seed-definition-diff.ts` + NEW `engine/seeds/seed-definition-diff.test.ts`.
- EDIT `index.ts` — export.

API (`apps/api/src/features/seeds/`)
- EDIT `seeds.mcp.ts` — risposta `mcp-plan` (+2 campi), audit `mcp-apply` (+1 campo).
- EDIT `seeds.test.ts` — +2 `it()`.
- NEW  `test/integration/seed-mcp-plan.integration.test.ts`.

CLI (`packages/cli/src/`)
- EDIT `lib/control-plane.ts`, `commands/schema-plan.ts`, `commands/schema-apply.ts`, `lib/manifest-compare.ts`.
- EDIT `test/schema-plan.test.ts`, `test/schema-apply.test.ts`, `test/manifest-compare.test.ts`.

MCP (`packages/mcp/src/`)
- EDIT `index.ts` — `McpPlanResponse`, descrizione `beech_schema_plan`.

Docs
- EDIT `CHANGELOG.md`, `docs/reference/seed-builder.md`, `docs/reference/mcp-server.md`,
  `docs/build/schema-modeling.md`, `docs/build/cli-workflows.md`, `docs/build/schema-manifest.md`.

Esclusi: dashboard, `packages/mcp/src/plans.ts`, DDL planner, `normalizeCandidate`/`classifyCandidate` (SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Modulo core `engine/seeds/seed-definition-diff.ts` (nuovo)

Perché qui: unico produttore della forma confrontabile, usato dal Worker (`mcp-plan`, `mcp-apply`) e dalla CLI
(`beech schema diff`). Header SPDX MIT come `tag-options.ts:L1-2`. Import ammessi: `../types.js`,
`../../common/canonical-json.js`, `./tag-options.js`. Export da `index.ts` subito dopo `L90`
(`export * from './engine/seeds/seed-definition-diff.js'`).

Firme verbatim:

```ts
/** A branch as either side of a comparison carries it: stored (`Branch`, with id) or manifest-authored (id optional). */
export type BranchDefinitionLike = Omit<Branch, 'id' | 'fields'> & { id?: string; fields?: BranchDefinitionLike[] }

/** A seed as either side of a comparison carries it: stored (`Seed`) or manifest-authored (no layout). */
export type SeedDefinitionLike = Omit<Seed, 'branches' | 'layout'> & { branches: BranchDefinitionLike[]; layout?: unknown }

/** Seed-level flags the engine treats as `false` when omitted. */
export const SEED_DEFINITION_FLAGS = ['allowDrafts', 'allowPublicRead', 'allowPublicPost', 'allowPublicEdit', 'softDelete'] as const

/** Branch-level flags the engine treats as `false` when omitted. `multiple` is resolved separately (see normalizeBranchDefinition). */
export const BRANCH_DEFINITION_FLAGS = ['requiredOnCreate', 'requiredOnUpdate'] as const

/** Comparable form of one branch definition. Two branches are the same definition iff their canonicalStringify bytes match. */
export function normalizeBranchDefinition(branch: BranchDefinitionLike): Record<string, unknown>

/** Comparable form of one seed definition (branches normalized, order kept). */
export function normalizeSeedDefinition(seed: SeedDefinitionLike): Record<string, unknown>

export interface SeedDefinitionDiff {
  /** True when the candidate's comparable definition differs from the stored one. Always true when nothing is stored. */
  changed: boolean
  /**
   * Aliases, in candidate order, of candidate branches that are new (no stored branch with the same id) or whose
   * comparable definition differs from the stored branch with the same id. `[]` when nothing is stored.
   */
  changedBranches: string[]
}

/** Compares a stored seed definition with a candidate whose ids were already resolved (`normalizeCandidate`). Pure. */
export function diffSeedDefinition(stored: Seed | null, candidate: Seed): SeedDefinitionDiff
```

Regole di `normalizeBranchDefinition` (contratto condiviso con `beech schema diff`):
1. `id` rimosso, anche nei sub-field (`fields`, ricorsivo con le stesse regole).
2. Ogni flag di `BRANCH_DEFINITION_FLAGS` materializzato come `value === true`.
3. `multiple`: su `tags` → `!isSingleChoiceTags(branch)` (omesso ≡ `true`, unica regola dello Sprint 1); su ogni
   altro tipo → `branch.multiple === true` (comportamento attuale di `manifest-compare.ts:L41`).
4. Ogni altra chiave copiata invariata, incluse quelle sconosciute: `options` è confrontato così com'è (valori,
   colori, ordine) — un cambio di colore **è** un cambio di definizione (a differenza del fingerprint, che lo esclude).
5. Non muta l'input; non lancia su input JSON.

Regole di `normalizeSeedDefinition`: `layout` rimosso; ogni flag di `SEED_DEFINITION_FLAGS` → `=== true`;
`branches` → `normalizeBranchDefinition` nell'ordine dato (l'ordine è dato: è l'ordine fisico delle colonne); altre
chiavi copiate invariate.

Regole di `diffSeedDefinition`:
- `stored === null` → `{ changed: true, changedBranches: [] }` (seed nuovo: lo dice già `classification: 'create'`).
- `changedBranches`: per ogni branch del candidato, il branch salvato con lo stesso `id`; assente, oppure
  `canonicalStringify(normalizeBranchDefinition(a)) !== canonicalStringify(normalizeBranchDefinition(b))` → alias
  incluso. I branch salvati assenti dal candidato non compaiono (sono già `blockedReasons` di `classifyCandidate`).
- `changed` = `changedBranches.length > 0` **oppure** i byte di `normalizeSeedDefinition` dei due lati differiscono
  (cambi di livello seed: `label`, flag, `displayNameAlias`, ordine dei branch, `dashboard`, …).
- Invarianti: stesso input → stesso output; identità per `id`, mai per alias.

### Task 2 — Risposta di `POST /api/seeds/:slug/mcp-plan` (`seeds.mcp.ts:L123-188`)

Calcola `const diff = diffSeedDefinition(storedDef, candidate)` subito dopo `normalizeCandidate` (`L143`), sempre
(anche se il piano è bloccato: è informativo). Aggiungi alla risposta, dopo `statements`:

| Chiave | Tipo | Valore |
|--------|------|--------|
| `definitionChanged` | `boolean` | `diff.changed`. `false` ⇒ la definizione salvata è già uguale al candidato: applicarlo non cambia nulla. |
| `changedBranches` | `string[]` | `diff.changedBranches` (alias, ordine del candidato). |

Aggiorna il docblock dell'handler (`L109-122`): una riga sui due campi. Nessun'altra chiave cambia.

### Task 3 — Audit di `POST /api/seeds/:slug/mcp-apply` (`seeds.mcp.ts:L249`, `L336-353`)

Dopo `normalizeCandidate` (`L249`) calcola `diffSeedDefinition(storedDef, candidate).changedBranches`; aggiungi a
`details` dell'audit la chiave `changedBranches: string[]` (accanto a `ddlCount`). Perché: "tracciabili" del brief —
un apply senza DDL oggi lascia nel log solo `ddlCount: 2`. Nessun'altra modifica al flusso di apply (scrive già la
definizione con DDL solo idempotente).

### Task 4 — CLI: `McpPlan` e decisioni su `definitionChanged`

**4a. `lib/control-plane.ts:L26-40`** — aggiungi a `McpPlan`, verbatim:

```ts
  /** False ⇒ the stored definition already equals the candidate: applying it changes nothing. The pending criterion. */
  definitionChanged: boolean
  /** Aliases of branches that are new or whose definition differs from the stored one (no DDL needed for most). */
  changedBranches: string[]
```

Campi obbligatori, nessun fallback per server vecchi (stessa scelta di `source`, aggiunto dallo sprint 3b senza
fallback: CLI e API sono rilasciati insieme).

**4b. `commands/schema-plan.ts`**
- Riepilogo (`L56-61`): `changing` = piani con `definitionChanged === true`.
- `renderPlan` (`L68-90`), dopo issues e blockedReasons:
  - `plan.applicable && !plan.definitionChanged` → stampa solo `pc.dim('    (no change)')` e **non** gli
    statements: la CLI non applicherà quel seed (Task 4c), e il docblock del comando promette che il DDL mostrato è
    quello che `apply` eseguirebbe.
  - altrimenti: statements come oggi, poi una riga per alias di `changedBranches`, verbatim
    `pc.yellow(\`    ~ ${alias} — definition changed\`)`.
  - `ftsRebuildNeeded` invariato. Rimuovi la condizione `plan.statements.length === 0` (`L88`).
- Docblock del comando (`L18-24`): "Computes — and only prints — what applying `beech.schema.ts` would change: DDL
  plus definition-only changes (e.g. tag options) the DDL cannot show."

**4c. `commands/schema-apply.ts`**
- `pending` (`L63`): seed il cui preview ha `definitionChanged === true`. Un seed invariato non viene più riscritto
  (oggi bump di versione a ogni run).
- `applyOne` (`L97-102`): la guardia "plan changed between review and apply" aborta anche se
  `fresh.changedBranches.join('\n') !== preview.changedBranches.join('\n')` (stesso `CliError`, stesso messaggio).
  Un `fresh.definitionChanged === false` (qualcun altro ha già scritto la stessa definizione) cade in questa
  guardia perché `changedBranches` diventa `[]` — conservativo, voluto.

### Task 5 — `lib/manifest-compare.ts`: delega al core

Elimina `SEED_FLAGS`, `BRANCH_FLAGS`, `normalizeSeed`, `normalizeBranch` e il tipo `Comparable` (`L37-73`).
`canonicalize` (`L79-82`) usa `normalizeSeedDefinition(seed)` (import da `@beechcms/core`) e poi `toCanonicalJson`
come oggi. Aggiorna il docblock del modulo/funzione: le normalizzazioni sono quelle di `normalizeSeedDefinition`
(id esclusi, flag omessi ≡ `false`, `multiple` dei `tags` omesso ≡ `true`, `layout` escluso).
Unico cambio di comportamento: un `tags` con `multiple` omesso ora è `in_sync` con uno salvato `multiple: true` e
`differs` da uno salvato `multiple: false` (oggi l'opposto: falso negativo sul passaggio a scelta singola).

### Task 6 — MCP (`packages/mcp/src/index.ts`)

- `McpPlanResponse` (`L74-93`): aggiungi `definitionChanged: boolean` e `changedBranches: string[]` con doc di
  una riga (stesso testo di Task 4a). `source` resta fuori (fuori perimetro).
- Descrizione di `beech_schema_plan` (`L131`): aggiungi, verbatim, prima di "Unsure about…":
  `A definition-only change (tag options, option colors, multiple) produces no DDL: it is reported as definitionChanged: true with the affected aliases in changedBranches, and beech_schema_apply persists it. definitionChanged: false means applying changes nothing.`
- `plans.ts` e `beech_schema_apply` invariati: l'apply MCP non filtra su `statements` e `StoredPlan` conserva solo
  ciò che l'apply usa.

### Task 7 — Documentazione

- `docs/reference/seed-builder.md` (`mcp-plan`, esempio `L347-360`): aggiungi `"definitionChanged": true` e
  `"changedBranches": ["pages"]` all'esempio; due bullet dopo `L365`: significato di `definitionChanged`
  (criterio "c'è qualcosa da applicare") e di `changedBranches` (include i cambi di sola definizione, es. opzioni e
  colori dei `tags`, che non producono DDL). Nota: `statements` di un seed esistente contiene sempre gli
  `CREATE INDEX IF NOT EXISTS` idempotenti.
- `docs/reference/mcp-server.md` (esempio `L171-188`): stessi due campi (`create` → `definitionChanged: true`,
  `changedBranches: []`); bullet `additive` (sezione "Safety Classifications", dopo l'esempio) cita `changedBranches`.
- `docs/build/schema-modeling.md:L250` (riga `beech_schema_plan`): aggiungi `definitionChanged` e `changedBranches`
  alla lista dei campi restituiti.
- `docs/build/cli-workflows.md:L31-32`: `schema plan` "Shows the DDL and the definition-only changes applying
  `beech.schema.ts` would make; unchanged seeds print `(no change)`."; `schema apply` "Skips seeds whose definition
  already matches."
- `docs/build/schema-manifest.md:L141`: commento `# 4. What would applying it change? (writes nothing)`.
- `CHANGELOG.md`: sotto `## Unreleased — BREAKING` aggiungi una sezione `### Schema plan / apply` (non breaking):
  plan mostra i cambi di sola definizione (`definitionChanged`, `changedBranches` in `mcp-plan`); `beech schema apply`
  salta i seed invariati invece di riscriverli a ogni run; `beech schema diff` tratta `multiple` omesso sui `tags`
  come `true`; l'audit `mcp-apply` registra `changedBranches`.

### Task 8 — Test (behaviour list)

Tutti: header SPDX (MIT in `packages/*`, BUSL in `apps/api` — copia il file vicino), quote singole, `it()` =
comportamento + esito, nessun `should`, nessun `any` nei test nuovi o nelle righe toccate (i `let exitSpy: any`
esistenti diventano `MockInstance` di vitest solo nei file che l'executor modifica comunque).

**`packages/core/src/engine/seeds/seed-definition-diff.test.ts`** — unit; fixture: `Seed`/`Branch` costruiti a mano
con un commento che richiama il vincolo circolare (`content-view.test.ts:L19`). Fixture base: un seed `posts` con
`br_01 title text requiredOnCreate`, `br_07 tags` libero, `br_11 priority tags multiple:false` con opzioni
`low #64748b`, `high #ef4444` (stessa forma del canonico).
`describe('normalizeBranchDefinition')`
- rimuove `id` dal branch e dai sub-field di un repeater e materializza `requiredOnCreate`/`requiredOnUpdate` omessi
  come `false`.
- risolve `multiple` omesso come `true` su un `tags` e come `false` su un `relation` (matrice: tags omesso/true/false,
  relation omesso/true).
- copia invariata una chiave sconosciuta e l'array `options` così com'è.
`describe('diffSeedDefinition')`
- restituisce `changed: true` e `changedBranches: []` quando non c'è definizione salvata.
- restituisce `changed: false` e `[]` per due definizioni identiche con chiavi in ordine diverso.
- segnala `['priority']` quando cambia solo il colore di un'opzione.
- segnala `['priority']` quando due opzioni vengono riordinate.
- segnala `['priority']` quando `multiple: false` viene rimosso da un `tags` (diventa multiplo).
- non segnala nulla quando `multiple: true` viene aggiunto esplicitamente a un `tags` che lo ometteva.
- non segnala nulla quando `requiredOnCreate: false` viene aggiunto a un branch che lo ometteva.
- elenca l'alias di un branch nuovo (id assente nel salvato) nell'ordine del candidato.
- restituisce `changed: true` con `changedBranches: []` quando cambia solo la `label` del seed.
- ignora `layout` presente solo su un lato.
- accoppia per `id`: un branch con stesso alias ma `id` diverso è riportato come nuovo.

**`apps/api/src/features/seeds/seeds.test.ts`** — unit (pattern esistente `buildApp` + `makeRepo`, `baseSeed`).
- in `describe('POST /:slug/mcp-plan')`: con definizione salvata = `baseSeed` e candidato con la `label` di un
  branch cambiata, la risposta 200 riporta `definitionChanged: true` e `changedBranches: [<alias>]`; con candidato =
  `baseSeed`, `definitionChanged: false` e `[]` (due `it()`, uno per caso).
- in `describe('POST /:slug/mcp-apply')`: l'audit `details.changedBranches` contiene l'alias del branch cambiato
  (copia l'arrange di `L1569-1588`, ma con `get` che restituisce `baseRecord` e candidato con la `label` di `body` cambiata → `["body"]`).

**`apps/api/src/features/seeds/test/integration/seed-mcp-plan.integration.test.ts`** — integration (harness, D1 reale,
`__resetSeedRegistryCache`, canonico `posts.br_11 priority`, `admin` via `harness.asUser('admin')`; setup come
`seed-ownership.integration.test.ts:L25-36`). Docblock: copre il riconoscimento dei cambi di sola definizione nel
control plane. `describe('seeds slice — integration (real D1)')`; il candidato si costruisce da
`GET /api/seeds/posts` → `definition` (helper locale `storedPosts()`, Rule 3.12).
`describe('POST /api/seeds/:slug/mcp-plan')`
- ripianificare la definizione salvata invariata risponde 200 con `definitionChanged: false` e `changedBranches: []`.
- cambiare il colore di `high` risponde 200, `applicable: true`, `definitionChanged: true`,
  `changedBranches: ['priority']` e nessuno statement `ADD COLUMN` (cambio senza DDL).
- rimuovere `multiple: false` da `priority` risponde `changedBranches: ['priority']`.
- il piano non scrive: dopo la richiesta `GET /api/seeds/posts` restituisce ancora il colore originale (Rule 5.6).
`describe('POST /api/seeds/:slug/mcp-apply')`
- applicare il cambio di colore (plan → `expectedVersion` → apply) risponde 200 e `GET /api/seeds/posts` restituisce
  il nuovo colore su `priority`; un nuovo plan dello stesso candidato riporta `definitionChanged: false`.
Commento obbligatorio (Rule 6.2.3): il drift fisico (colonna mancante a definizione invariata) non è coperto qui
perché è compito di `beech schema diff` (`packages/cli/src/test/schema-diff.test.ts`).

**`packages/cli/src/test/schema-plan.test.ts`** — unit (mock esistenti di `manifest-loader` e `control-plane`).
Aggiorna i mock esistenti con `definitionChanged`/`changedBranches`. Aggiungi:
- `renderPlan` stampa `(no change)` e nessuno statement per un piano applicabile con `definitionChanged: false`
  anche se `statements` contiene `CREATE INDEX IF NOT EXISTS` (commento: l'output stampato è il soggetto di
  `renderPlan`, Rule 5.8).
- `renderPlan` stampa una riga `~ priority — definition changed` per un piano con `changedBranches: ['priority']`.
- `schemaPlan` non esce con 1 e non conta come "ready" un seed con `definitionChanged: false` (assert: riepilogo
  "Nothing to apply" stampato, `exitSpy` mai chiamato).

**`packages/cli/src/test/schema-apply.test.ts`** — unit. Aggiorna ogni mock esistente con `definitionChanged: true`,
`changedBranches: []` (oggi `pending` è implicitamente "statements non vuoto"). Aggiungi:
- applica un seed con `definitionChanged: true`, `changedBranches: ['priority']` e soli statements idempotenti
  (`applySpy` chiamato una volta per quel seed).
- non chiede conferma e non applica nulla quando ogni piano ha `definitionChanged: false`.
- applica solo i seed cambiati in un manifest con un seed cambiato e uno invariato (`applySpy` chiamato con lo slug
  cambiato, una volta).
- aborta il seed i cui `changedBranches` differiscono tra review e apply (`applySpy` mai chiamato, exit 1).

**`packages/cli/src/test/manifest-compare.test.ts`** — unit. Aggiungi:
- un `tags` con `multiple` omesso nel manifest è `in_sync` con il deployato `multiple: true`.
- un `tags` con `multiple` omesso nel manifest è `differs` dal deployato `multiple: false`.
- un cambio di colore di un'opzione è `differs`.
Il caso `it.each` esistente su `multiple` (branch `text`) resta verde invariato.

Nessun test nuovo per `packages/mcp`: cambiano solo un tipo privato e una stringa di descrizione; la risposta è già
inoltrata intera (`index.ts:L296`, coperto da `integration.test.ts`).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Exit code 0 per tutti, in ordine:

```bash
pnpm --filter @beechcms/core run type-check
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api run type-check
pnpm --filter @beechcms/cli run build          # nessuno script type-check: build = tsc
pnpm --filter @beechcms/cli test
pnpm --filter @beechcms/mcp run type-check
pnpm --filter @beechcms/mcp test
pnpm run type-check                            # turbo: ogni altro consumatore
pnpm beech test                                # suite completa, api integration (D1 reale) inclusa
pnpm run lint
pnpm run lint:tests                            # placement dei test (testing_conventions §1)
graphify update .
```

Nota: `packages/testing` va ricostruito (`pnpm --filter @beechcms/testing build`) prima degli integration test se il
`dist` non contiene `br_11` (execution log dello Sprint 1).

Controllo manuale (con `pnpm beech dev` attivo e un `beech.schema.ts` esportato con `npx beech schema export`):
`npx beech schema plan` → ogni seed `(no change)` e "Nothing to apply"; cambiare il colore di un'opzione di
`clienti.tier` → plan mostra `~ tier — definition changed`; `npx beech schema apply --yes` → applica solo `clienti`;
re-plan → `(no change)`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Sprint 1 committato prima dell'inizio (baseline).
- [ ] `seed-definition-diff.ts` esporta verbatim `BranchDefinitionLike`, `SeedDefinitionLike`,
      `SEED_DEFINITION_FLAGS`, `BRANCH_DEFINITION_FLAGS`, `normalizeBranchDefinition`, `normalizeSeedDefinition`,
      `SeedDefinitionDiff`, `diffSeedDefinition`; importa solo `../types.js`, `../../common/canonical-json.js`,
      `./tag-options.js`; nessun import da `schema/`.
- [ ] `normalizeBranchDefinition` usa `isSingleChoiceTags` per `multiple` dei `tags`; nessun'altra copia della regola.
- [ ] `manifest-compare.ts` non contiene più `SEED_FLAGS`, `BRANCH_FLAGS`, `normalizeSeed`, `normalizeBranch`.
- [ ] `POST /api/seeds/:slug/mcp-plan` restituisce `definitionChanged: boolean` e `changedBranches: string[]`; un
      cambio di sole opzioni/colori/`multiple` dei `tags` produce `definitionChanged: true` con l'alias, senza
      `ADD COLUMN`; la definizione invariata produce `false` e `[]`.
- [ ] L'audit `mcp-apply` contiene `changedBranches`.
- [ ] `McpPlan` (CLI) e `McpPlanResponse` (MCP) dichiarano i due campi; la descrizione di `beech_schema_plan` cita
      i cambi di sola definizione.
- [ ] `beech schema plan` stampa `(no change)` (senza statements) per un seed invariato, `~ <alias> — definition
      changed` per ogni branch cambiato, e il riepilogo conta solo i seed con `definitionChanged`.
- [ ] `beech schema apply` applica solo i seed con `definitionChanged`; aborta se `statements` **o**
      `changedBranches` cambiano tra review e apply.
- [ ] `beech schema diff`: `tags` con `multiple` omesso ≡ `true`.
- [ ] Docs (`seed-builder.md`, `mcp-server.md`, `schema-modeling.md`, `cli-workflows.md`, `schema-manifest.md`) e
      `CHANGELOG.md` aggiornati.
- [ ] Nessun file in `apps/dashboard/`, `packages/mcp/src/plans.ts`, `engine/ddl/` modificato.
- [ ] Tutti i comandi della SECTION 5 a exit 0; nessun `it.skip`/`it.only`; test conformi a `testing_conventions.md`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

L'executor NON deve:

- Toccare la dashboard: editor opzioni, colori, interruttore singolo/multiplo nel seed builder, chip →
  ROADMAP §3 `TagChoiceEditing`.
- Toccare kanban, ordinamento, raggruppamento, config vista, formattazione condizionale, automazioni →
  ROADMAP §4 `TagChoiceViews`.
- Cambiare `planExtendSeed` / `generateIndexes` per non riemettere gli indici idempotenti, o far parsare `statements`
  a CLI/MCP: il criterio "c'è qualcosa da applicare" è `definitionChanged`.
- Rilevare il drift fisico (colonna mancante a definizione invariata) nel plan: è `beech schema diff` / `diffSeed`.
- Correggere `normalizeCandidate`, che non sostituisce gli `id` coniati localmente da `manifestToSeeds` per un
  manifest scritto a mano senza id (accoppiamento per alias promesso da `manifest.types.ts:L24-26` ma non
  implementato): difetto preesistente, fuori dal brief; il flusso export → modifica → apply porta già gli id.
  Tracciato in #712.
- Modificare `packages/mcp/src/plans.ts`, `beech_schema_apply`, `classifyCandidate`, o aggiungere un diff
  prima/dopo per chiave.
- Aggiungere `source` a `McpPlanResponse` del MCP, nuovi flag CLI, nuovi endpoint, migrazioni D1.
- Migrazione dati `text` → `tags` / `string[]` → `TagOption[]` (rimandata alla 0.9, ROADMAP "Rimandato").
- Rigenerare a mano `docs/api/**` (TypeDoc) o bumpare versioni di pacchetto.
