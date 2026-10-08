# ROADMAP — Tag con opzioni come unico modello di scelta (`text`+`options` → `tags` single/multiple)

Brief sorgente: `stages/00_ideation/output/feature_brief.md` (il `text` con `options` sparisce; i `tags` con opzioni
`{ value, color }` vincolanti diventano l'unico modello di scelta, con modalità singola/multipla via `multiple`; il
dato è sempre un array; kanban/ordinamento/raggruppamento solo su tag a scelta singola; rottura deliberata, DB nuovo).
Pianificato: 2026-10-08. Stato del grafo al momento della pianificazione: `graphify-out/` rigenerato 2026-10-08 15:08.

La feature attraversa quattro confini che vanno validati separatamente e mergiati in ordine:

1. **contratto del dato** (`@beechcms/core` tipi + validatori + boot, consumatori API/SDK, seed demo) — rompe la
   compilazione di ogni consumatore di `Branch.options`, quindi porta con sé il ponte di compilazione minimo della
   dashboard;
2. **tooling di schema** (piano/applicazione CLI + MCP) — oggi un cambio di sola definizione non viene né mostrato
   né applicato;
3. **UX di inserimento e presentazione** (dashboard: form, chip, seed builder);
4. **semantica delle viste** (kanban, ordinamento, raggruppamento, config vista, formattazione condizionale,
   automazioni).

Solo lo sprint marcato **NEXT** ha un piano dettagliato. Gli altri restano voci di roadmap finché non tocca a loro:
i loro Task Details verranno scritti sul codice che esisterà allora.

Invariante di rollout: gli sprint 1–4 atterrano su `devs`; nessun tag di versione / release finché lo Sprint 4 non è
PASS. Tra Sprint 1 e Sprint 3 il seed builder non offre l'editor delle opzioni (rimosso nello Sprint 1 perché
scriverebbe la forma `string[]` che il boot ora rifiuta): le opzioni si dichiarano da codice, CLI o MCP.

Precondizione dello Sprint 1: il working tree contiene un hotfix non committato (seed demo `text`→`tags`, widget
`json_each` sui tags, `JsonEdit` che emette array, palette posizionale `colorForOption`). È la baseline: va
committato prima dell'avvio dello Sprint 1.

---

## 1. `TagOptionsContract` — **NEXT**

- **Goal:** `Branch.options` diventa `TagOption[]` (`{ value, color }`) valido solo sui `tags`; seed malformati
  rifiutati al boot; valori fuori elenco, duplicati e cardinalità violata rifiutati in scrittura con 400.
- **Deliverables summary:** core `TagOption` + `engine/seeds/tag-options.ts` (`isSingleChoiceTags`,
  `tagOptionValues`, `findTagOption`, `tagOptionsIssues`, `TAG_OPTION_COLOR_RE`); Fatal 18 in
  `validateSeedDefinitions` + guardia in `SeedRegistry`; `tagsSchema` vincolante (one-of, unique, max:1, nessuna
  dedup silenziosa); chiave cache validazione; `SCHEMA_FINGERPRINT_VERSION` 2 (valori + modalità); generatore tipi;
  kanban core senza ramo `text`; proiezione `GET /api/v1/public/:seed/schema`; `@beechcms/forms-react` invia array;
  seed demo riscritti (unica sorgente `demo-seeds.ts`); ramo canonico `posts.priority`; ponte di compilazione
  dashboard (nessuna nuova UX); docs + `CHANGELOG.md` con nota di rottura.
- **Depends on:** commit dell'hotfix in working tree (vedi precondizione).

## 2. `SchemaPlanDefinitionDiff`

- **Goal:** `beech schema plan|apply` e `beech_schema_plan|apply` (MCP) vedono e applicano un cambio di sola
  definizione (forma/ordine/colore delle opzioni, `multiple`) anche quando non produce DDL.
- **Deliverables summary:** funzione pura core che elenca gli alias dei branch la cui definizione canonica differisce
  (id esclusi); campo `changedBranches` nella risposta di `POST /api/seeds/:slug/mcp-plan`; `McpPlan`
  (`packages/cli/src/lib/control-plane.ts`, `packages/mcp/src/plans.ts`) esteso; `schema-plan` / `schema-apply`
  considerano "pendente" un seed con DDL **o** branch cambiati (oggi filtrano su `statements.length > 0`, quindi un
  cambio di opzioni stampa "(no change)" e non viene applicato); `manifest-compare.ts` normalizza `multiple` dei
  `tags` (omesso ≡ `true`, oggi omesso ≡ `false`).
- **Depends on:** Sprint 1 (forma `TagOption`, `isSingleChoiceTags`).

## 3. `TagChoiceEditing`

- **Goal:** l'editor sceglie da un menu a tendina con pallino colore (singola: un valore, multipla: più chip); i tag
  appaiono come chip colorati ovunque; il seed builder definisce opzioni, colori e modalità.
- **Deliverables summary:** editor tags con opzioni (dropdown, single/multi) in `components/fields/edit`; chip
  colorati da `option.color` in form/tabella/gallery/card kanban; chip grigio neutro con indicazione "non presente
  nelle opzioni" per valori obsoleti; tag liberi con chip neutro (eliminata l'interpretazione colore/hex nei valori
  di `extractTagChips`); seed builder: editor righe opzione (valore + colore `#RRGGBB`), interruttore
  singolo/multiplo, errori presi da `tagOptionsIssues` (stesse regole del boot, nessuna regola propria).
- **Depends on:** Sprint 1.

## 4. `TagChoiceViews`

- **Goal:** kanban, ordinamento e raggruppamento funzionano solo sui tag a scelta singola, nell'ordine delle opzioni;
  config di vista su un tag multiplo è un errore di validazione; regole e automazioni hanno parità funzionale col
  vecchio testo con opzioni.
- **Deliverables summary:** `isAxisCandidate` accetta solo `tags` singoli (+ boolean), colonne con colore opzione;
  `kanban-move` imposta `[newValue]`/`[]` sui tag singoli (oggi fa swap e lascerebbe un valore obsoleto + nuovo →
  422); `buildSelectQuery` ordina i tag singoli per posizione opzione (`CASE`), alfabetico senza opzioni; funzione
  core che segnala riferimenti a tag multipli in `sort` / `groupBy` / `kanban.axisBranchId` e 422 nei handler
  `POST/PATCH /api/content/:slug/views`; toolbar: colonne ordinabili/raggruppabili = tag singoli (il ramo
  `text`+`options` di `getGroupableColumns` è già rimosso dallo Sprint 1), ordine dei gruppi = ordine opzioni;
  formattazione condizionale e
  `when-evaluator` delle automazioni con semantica array (`eq`/`neq`/`in`/`notin`/`isempty` su `string[]`);
  `automation-value-input` con valori opzione.
- **Depends on:** Sprint 1. Indipendente dallo Sprint 3; ordinato dopo per evitare conflitti su
  `components/fields` e `content-kanban`.

---

## Rimandato fuori dalla serie

- Migrazione automatica di dati e seed esistenti (`text` → `tags`, `string[]` → `TagOption[]`): rimandata alla 0.9
  (brief §5).
