### Pre-Computation Analysis

1. **God Nodes Identificati via CLI (`graphify explain`):**
   - `validateLayoutAgainstSeed()` (`packages/core/src/dashboard-layout/seed-layout.ts:L284`, Degree: 5): Governa la validazione semantica della struttura dei layout dei Seed sia lato Core che a monte degli endpoint REST in `apps/api/src/features/schema/schema.handler.ts`.
   - `isFullWidthBranch()` (`packages/core/src/dashboard-layout/seed-layout.ts:L116`, Degree: 4): Determina le regole di layout a tutta larghezza sia per la generazione automatica di default sia per i vincoli dell'editor.
   - `useLayoutBuilder()` (`apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts:L123`, Degree: 11): God Node per la gestione dello stato interattivo, drag-and-drop, assegnazione e rimodellamento delle colonne e sezioni nel Layout Builder della dashboard.
   - `useEntryEditorDialog()` (`apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx:L160`, Degree: 18): God Node principale orchestratore del ciclo di vita del form delle entry, della sanitizzazione payload e dell'intercettazione submit.
   - `JsonEdit()` (`apps/dashboard/src/components/fields/edit/json.tsx:L63`, Degree: 6): Componente di editing registrato nel `fieldRegistry` condiviso per branch `json` e `tags`.

2. **Confini Architetturali Coinvolti:**
   - `@beechcms/core` (`packages/core/src/dashboard-layout/seed-layout.ts`): Rimozione del tipo `'json'` da `UNSUPPORTED_BRANCH_TYPES`, inclusione in `FULL_WIDTH_BRANCH_TYPES`, estensione di `validateLayoutAgainstSeed` per imporre l'invariante a colonna singola (`columns.length === 1`) e isolamento di sezione (`fieldsInSection.length === 1`), generazione automatica in `generateDefaultLayout`.
   - `apps/api` (`apps/api/src/features/schema/schema.handler.ts`): Nessuna modifica al codice sorgente richiesta. L'API delega già la validazione a `validateLayoutAgainstSeed` e `formLayoutSchema` di `@beechcms/core`. Ricompilando `@beechcms/core`, `apps/api` eredita automaticamente la conformità semantica senza violare i confini di slice o introdurre query D1 raw.
   - `apps/dashboard` (`apps/dashboard/src/features/entry-editor/`):
     - Builder: Aggiornamento delle guardie in `use-layout-builder.ts` (`wouldViolateFullWidthWithMap` e `setSectionColumnCount`) per bloccare l'inserimento di campi JSON in sezioni con più di una colonna o l'incremento di colonne in sezioni contenenti campi JSON.
     - Form Lifecycle: Aggiornamento di `prepareSubmissionPayload` e `validateEntryJsonFields` in `use-entry-editor-dialog.tsx` per garantire che il form rifiuti submit con stringhe malformate e normalizzi automaticamente a `{}` i valori vuoti/svuotati.

3. **Output di Impatto (`graphify affected`):**
   - `validateLayoutAgainstSeed`: Dipendenza diretta da `seed-layout.test.ts`. I test di layout esistenti continuano a passare; nuovi test coprono la validazione di campi JSON full-width e il rifiuto di layout multi-colonna con campi JSON.
   - `isFullWidthBranch`: Chiamato da `buildSectionsForBranches`, `generateDefaultLayout` e `validateLayoutAgainstSeed`. Nessuna rottura su `richtext` o gallery files; i campi `json` ora beneficiano automaticamente del medesimo isolamento strutturale.
   - `useLayoutBuilder`: Dipendenze verificate verso `layout-builder-dialog.tsx`, `builder-pane.tsx`, `use-layout-builder.test.ts`. Nessun breaking change di interfaccia; le funzioni di mutazione applicano i vincoli in modo trasparente.
   - Nessuna violazione cross-slice riscontrata (`graphify path "useLayoutBuilder" "useEntryEditorDialog"`: nessun cammino diretto).

---

### VETO Audit

- **Botanical Invariant Check:**
  - Il piano NON effettua alcuna query D1 diretta o query builder bypassando `@beechcms/core`.
  - La persistenza dei layout passa attraverso il `seedLayoutRepository` esistente via endpoint `PUT /schema/:slug/layout`.
  - La serializzazione e deserializzazione dei campi JSON nel database D1 rimangono affidate a `serializeForDb` (`JSON.stringify`) e `deserializeFromDb` (`JSON.parse`) in `packages/core/src/engine/serialize.ts`, rispettando rigorosamente gli ID stabili di branch (`br_XX`).
  - Esito: CONFORME.

- **Vertical Slice Architecture (VSA) Check:**
  - Nessun cross-import tra `apps/dashboard/src/features/*`.
  - I componenti del Layout Builder risiedono integralmente nella slice `features/entry-editor/builder/`.
  - I componenti dei campi risiedono nella shared component library `@/components/fields`.
  - La logica semantica di base viene centralizzata in `@beechcms/core`.
  - Esito: CONFORME.

- **YAGNI & Cloudflare Purity:**
  - Nessun ORM pesante introdotto. Nessuna modifica non deterministica dello schema SQLite. Nessun job asincrono o worker secondario.
  - L'editor CodeMirror 6 viene escluso da questo sprint e demandato allo Sprint 2 (Scope Gate rispettato).
  - Esito: CONFORME.

- **Verdetto:**
  **APPROVATO.**
  HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

I campi di tipo `json` in BeechCMS sono stati storicamente confinati tra i tipi non supportati dal motore di layout (`UNSUPPORTED_BRANCH_TYPES = new Set(['json'])`), impedendone la composizione tramite Layout Builder e la generazione automatica all'interno dei form delle entry. Anche la logica di serializzazione e validazione a livello di form della dashboard non garantisce ancora una gestione ermetica dei valori vuoti (che devono sempre normalizzarsi a `{}` per evitare valori nulli o stringhe corrotte) e non intercetta gli errori di sintassi prima dell'invio alle API.

Questo sprint deve essere eseguito **prima di qualsiasi integrazione UI complessa (come l'editor visuale basato su CodeMirror 6)** per le seguenti ragioni architetturali:

1. **Invariante Botanico e Single Source of Truth:** Le regole di eleggibilità e validazione semantica dei layout risiedono esclusivamente in `@beechcms/core` (`seed-layout.ts`). Prima che la dashboard o l'interfaccia utente possano mostrare o manipolare un campo JSON, il Core deve riconoscere `json` come un tipo a tutta larghezza (`FULL_WIDTH_BRANCH_TYPES`), garantendo che il validatore semantico (`validateLayoutAgainstSeed`) respinga layout illegali (sezioni multi-colonna o condivise con altri campi).
2. **Isolamento dei Confini VSA e Stabilità del Contratto Dati:** La validazione e la normalizzazione dei payload inviati al backend devono essere garantite a livello di ciclo di vita del form (`use-entry-editor-dialog.tsx`) indipendentemente dal componente visivo di input utilizzato. Costruire il contratto dati (validazione sintattica pre-submit, normalizzazione automatica da stringa vuota o whitespace a `{}`) garantisce che nessun payload corrotto raggiunga mai `@beechcms/core` o il database D1.
3. **Prevenzione di Regressioni nel Layout Builder:** Le guardie sul drag-and-drop e sul menu contestuale delle colonne in `apps/dashboard` devono riflettere immediatamente i vincoli imposti dal Core, impedendo agli utenti di salvare layout non conformi.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

1. **Core Layout (`packages/core/src/dashboard-layout/seed-layout.ts`):**
   - Linea 91: `export const FULL_WIDTH_BRANCH_TYPES = new Set<Branch['type']>(['richtext'])`
   - Linea 100: `export const UNSUPPORTED_BRANCH_TYPES = new Set<Branch['type']>(['json'])`
   - Linea 108: `isLayoutableBranch()` scarta qualsiasi branch appartenente a `UNSUPPORTED_BRANCH_TYPES`. Di conseguenza, i campi JSON vengono completamente ignorati da `generateDefaultLayout` e rimossi come campi non validi durante `validateLayoutAgainstSeed`.
   - Linee 338–345: `validateLayoutAgainstSeed()` verifica che i branch full-width non condividano la sezione con altri campi (`fieldsInSection.length > fullWidthInSection.length`), ma NON controlla che `section.columns.length === 1`, consentendo potenzialmente una sezione a più colonne purché vuote.

2. **API Endpoint (`apps/api/src/features/schema/schema.handler.ts`):**
   - Linee 89–107: `schemaApp.put('/:slug/layout')` riceve il layout, lo valida con `formLayoutSchema.safeParse(body)` e poi invoca `validateLayoutAgainstSeed(parsed.data, seed!)`. L'API dipende puramente da `@beechcms/core` e non contiene logica cablata sui tipi di branch.

3. **Dashboard Layout Builder (`apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts`):**
   - `wouldViolateFullWidthWithMap()` controlla solo se le colonne della sezione contengono già campi, ma NON impedisce l'assegnazione di un branch full-width se la sezione ha `columns.length > 1` ma le colonne sono temporaneamente vuote.
   - `setSectionColumnCount()` permette di incrementare il numero di colonne di una sezione anche se questa contiene già un campo full-width (sebbene `section-card.tsx` mostri un avviso, il metodo dell'hook non è blindato).

4. **Dashboard Form Lifecycle (`apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`):**
   - `prepareSubmissionPayload()` (linee 103–140): se `branch.type === "json"` e il valore è vuoto (`""` o whitespace), non normalizza a `{}` ma passa la stringa vuota o il valore grezzo.
   - `validateEntryJsonFields()` (linee 142–158): esegue `JSON.parse(value)` solo se `value` è una stringa non vuota; se il campo contiene solo spazi o è vuoto non esplicita la conformità con la normalizzazione a `{}`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

1. `packages/core/src/dashboard-layout/seed-layout.ts`:
   - Rimozione di `'json'` da `UNSUPPORTED_BRANCH_TYPES`.
   - Aggiunta di `'json'` a `FULL_WIDTH_BRANCH_TYPES`.
   - Rafforzamento di `validateLayoutAgainstSeed()`: verifica che qualsiasi sezione contenente un branch full-width abbia esattamente 1 colonna (`section.columns.length === 1`) ed esattamente 1 campo totale (`fieldsInSection.length === 1`).
2. `packages/core/src/dashboard-layout/seed-layout.test.ts`:
   - Nuovi test unitari che verificano la generazione di layout predefiniti con sezioni dedicate per campi JSON.
   - Test per `validateLayoutAgainstSeed()` che accetta campi JSON in sezioni dedicate a 1 colonna e respinge sezioni con più colonne o campi condivisi.
3. `apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts`:
   - Aggiornamento di `wouldViolateFullWidthWithMap()`: se `incomingBranch` è full-width, rifiutare l'assegnazione se `section.columns.length > 1` o se sono presenti altri campi. Se `incomingBranch` non è full-width, rifiutare se la sezione ospita già un campo full-width.
   - Aggiornamento di `setSectionColumnCount()`: bloccare il cambio colonne se la sezione contiene un campo full-width e `n > 1`.
4. `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`:
   - Aggiornamento di `prepareSubmissionPayload()`: per i campi `json`, se il valore è `undefined`, `null`, `""`, o stringa di soli spazi bianchi, normalizzare a `{}`. Se è una stringa valida, deserializzare con `JSON.parse` prima dell'invio.
   - Aggiornamento di `validateEntryJsonFields()`: considerare valido un valore vuoto o whitespace (in quanto verrà normalizzato a `{}`), e restituire errore di validazione `{ isValid: false, errorFieldLabel: branch.label }` in caso di stringa sintatticamente errata.
5. `apps/dashboard/src/test/hooks/use-layout-builder.test.ts`:
   - Nuovi test per le guardie di `wouldViolateFullWidthWithMap` e `setSectionColumnCount` applicate ai campi JSON.
6. `apps/dashboard/src/test/features/entry-editor/entry-json-form.test.ts` (nuovo file di test o estensione test esistenti):
   - Test unitari per `prepareSubmissionPayload` e `validateEntryJsonFields` con payload JSON validi, malformati e vuoti.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1: Promozione Core di `json` a Tipo Full-Width e Validazione Semantica

**File:** `packages/core/src/dashboard-layout/seed-layout.ts`

1. Modificare le costanti di tipo di branch (linee 90-101):
```typescript
/** Branch types that must occupy a section alone, full width. */
export const FULL_WIDTH_BRANCH_TYPES = new Set<Branch['type']>(['richtext', 'json'])

/** Returns true when a branch is a gallery (file + multiple/asset-list). */
export function isGalleryBranch(branch: Branch): boolean {
  return branch.type === 'file'
    && (branch.multiple === true || branch.format === 'asset-list')
}

/** Branch types currently unsupported in the Layout Builder. */
export const UNSUPPORTED_BRANCH_TYPES = new Set<Branch['type']>([])
```

2. Rafforzare il controllo in `validateLayoutAgainstSeed()` (attorno a linea 338):
```typescript
      // Full-width branches must occupy a dedicated single-column section
      const fullWidthInSection = fieldsInSection.filter(isFullWidthBranch)
      if (fullWidthInSection.length > 0) {
        if (fieldsInSection.length > 1) {
          for (const fw of fullWidthInSection) {
            errors.push(
              `Branch '${fw.alias}' (type=${fw.type}) must occupy a dedicated section and cannot share it with other fields.`,
            )
          }
        }
        if (section.columns.length > 1) {
          for (const fw of fullWidthInSection) {
            errors.push(
              `Branch '${fw.alias}' (type=${fw.type}) must occupy a single-column section.`,
            )
          }
        }
      }
```

3. Verificare `buildSectionsForBranches()` (linea 226):
Poiché `isFullWidthBranch(branch)` restituisce `true` per `json`, `buildSectionsForBranches()` alloca automaticamente una sezione dedicata a 1 colonna:
`columns: [{ id: newId(), fields: [{ branchId: branch.id }] }]`. Nessuna modifica necessaria alla logica del generator.

---

### Task 2: Core Test Suite per Layout JSON

**File:** `packages/core/src/dashboard-layout/seed-layout.test.ts`

Aggiungere test in `describe('validateLayoutAgainstSeed')` e `describe('generateDefaultLayout')`:
- Verificare che `generateDefaultLayout` generi una sezione dedicata per un branch con `type: 'json'`.
- Verificare che `validateLayoutAgainstSeed` ritorni `ok: true` per una sezione con 1 colonna contenente un branch `json`.
- Verificare che `validateLayoutAgainstSeed` ritorni `ok: false` se un branch `json` condivide la sezione con un altro branch.
- Verificare che `validateLayoutAgainstSeed` ritorni `ok: false` se la sezione con il branch `json` ha `columns.length > 1`.

---

### Task 3: Aggiornamento Vincoli nel Layout Builder Hook

**File:** `apps/dashboard/src/features/entry-editor/builder/use-layout-builder.ts`

1. Aggiornare `wouldViolateFullWidthWithMap`:
```typescript
function wouldViolateFullWidthWithMap(
  section: LayoutSection,
  incomingBranch: Branch,
  branchMap: Map<string, Branch>,
  excludeColId?: string,
  excludeBranchId?: string,
): boolean {
  if (isFullWidthBranch(incomingBranch)) {
    // Cannot place full-width field in a multi-column section
    if (section.columns.length > 1) return true
    return section.columns.some((c) => {
      const fieldsToCheck = (c.id === excludeColId && excludeBranchId)
        ? c.fields.filter((f) => f.branchId !== excludeBranchId)
        : c.fields
      return fieldsToCheck.length > 0
    })
  } else {
    // Non-full-width branch cannot be placed into a section containing a full-width branch
    return section.columns.some((c) =>
      c.fields.some((f) => {
        if (c.id === excludeColId && f.branchId === excludeBranchId) return false
        const b = branchMap.get(f.branchId)
        return b != null && isFullWidthBranch(b)
      })
    )
  }
}
```

2. Blindare `setSectionColumnCount`:
```typescript
  const setSectionColumnCount = useCallback((tabId: string, sectionId: string, n: 1 | 2 | 3 | 4) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) => {
        if (t.id !== tabId) return t
        return {
          ...t,
          sections: t.sections.map((s) => {
            if (s.id !== sectionId) return s
            // If section contains a full-width branch, refuse splitting into multiple columns
            const hasFullWidth = s.columns.some((c) =>
              c.fields.some((f) => {
                const b = branchMap.get(f.branchId)
                return b != null && isFullWidthBranch(b)
              })
            )
            if (hasFullWidth && n > 1) return s

            const current = s.columns
            if (n > current.length) {
              return { ...s, columns: [...current, ...Array.from({ length: n - current.length }, () => makeColumn())] }
            }
            if (n < current.length) return { ...s, columns: current.slice(0, n) }
            return s
          }),
        }
      }),
    }))
  }, [mutate, branchMap])
```

---

### Task 4: Blindatura del Contratto Dati del Form Entry (Validazione & Normalizzazione Vuoto)

**File:** `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`

1. Aggiornare `prepareSubmissionPayload()`:
```typescript
export function prepareSubmissionPayload({
  branches,
  formData,
  slug,
  status,
}: {
  branches: EditorBranch[]
  formData: Record<string, unknown>
  slug: string
  status: string
}): Record<string, unknown> {
  const processed: Record<string, unknown> = {}

  for (const branch of branches) {
    const value = Object.hasOwn(formData, branch.alias) ? formData[branch.alias] : undefined
    if (branch.type === "relation" && value === "") {
      processed[branch.alias] = branch.multiple ? [] : null
    } else if (branch.type === "json") {
      // Invariant: empty string, whitespace, null, or undefined normalizes to an empty valid object {}
      if (value === undefined || value === null || value === "" || (typeof value === "string" && !value.trim())) {
        processed[branch.alias] = {}
      } else if (typeof value === "string") {
        try {
          processed[branch.alias] = JSON.parse(value)
        } catch {
          processed[branch.alias] = value
        }
      } else {
        processed[branch.alias] = value
      }
    } else if (value !== undefined) {
      processed[branch.alias] = value
    }
  }

  return {
    slug: slug.trim() || null,
    status: status.trim() || "published",
    ...processed,
  }
}
```

2. Aggiornare `validateEntryJsonFields()`:
```typescript
export function validateEntryJsonFields(
  branches: EditorBranch[],
  formData: Record<string, unknown>
): { isValid: true } | { isValid: false; errorFieldLabel: string } {
  for (const branch of branches) {
    if (branch.type !== "json") continue
    const value = Object.hasOwn(formData, branch.alias) ? formData[branch.alias] : undefined
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "string") {
      if (!value.trim()) continue // Empty whitespace will be normalized to {}
      try {
        JSON.parse(value)
      } catch {
        return { isValid: false, errorFieldLabel: branch.label }
      }
    }
  }
  return { isValid: true }
}
```

---

### Task 5: Unit Test Suite per Layout Builder e Entry Form Lifecycle

1. **File:** `apps/dashboard/src/test/hooks/use-layout-builder.test.ts`:
   - Aggiungere un branch `json` nel mock seed.
   - Testare che `assignField` rifiuti l'assegnazione di un branch JSON a una sezione con `columns.length > 1`.
   - Testare che `assignField` rifiuti l'assegnazione di un branch non full-width a una sezione contenente un branch JSON.
   - Testare che `setSectionColumnCount` non modifichi il numero di colonne oltre 1 per una sezione contenente un branch JSON.

2. **File:** `apps/dashboard/src/test/features/entry-editor/entry-json-form.test.ts`:
   - Testare `prepareSubmissionPayload` con un campo JSON contenente:
     - Una stringa JSON valida `{"foo":"bar"}` → deserializzata in `{ foo: "bar" }`.
     - Una stringa vuota `""` o spazi `"   "` → normalizzata a `{}`.
     - `null` o `undefined` → normalizzato a `{}`.
   - Testare `validateEntryJsonFields`:
     - Restituisce `isValid: true` per `""`, `"   "`, `"{ \"a\": 1 }"`.
     - Restituisce `isValid: false` con label appropriata per `" { malformed JSON "` .

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Tutte le verifiche devono passare senza errori di typecheck o test falliti:

1. **Build & Typecheck Core:**
   ```bash
   pnpm --filter @beechcms/core run build
   ```

2. **Unit Test Core:**
   ```bash
   pnpm --filter @beechcms/core test
   ```

3. **Typecheck API (verifica non-rottura su `validateLayoutAgainstSeed`):**
   ```bash
   pnpm --filter @beechcms/api build
   ```

4. **Typecheck Dashboard:**
   ```bash
   pnpm --filter @beechcms/dashboard run type-check
   ```

5. **Test Unitari Dashboard:**
   ```bash
   pnpm --filter @beechcms/dashboard test
   ```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `UNSUPPORTED_BRANCH_TYPES` in `@beechcms/core` non contiene più `'json'`.
- [ ] `FULL_WIDTH_BRANCH_TYPES` in `@beechcms/core` contiene `'json'`.
- [ ] `isLayoutableBranch` restituisce `true` per qualsiasi branch di tipo `json` (esclusi gli alias di sistema o policy hidden).
- [ ] `generateDefaultLayout` genera una sezione dedicata a 1 colonna a tutta larghezza per ciascun campo `json` presente nel Seed.
- [ ] `validateLayoutAgainstSeed` valida con successo un layout con campo `json` in sezione a 1 colonna dedicata.
- [ ] `validateLayoutAgainstSeed` fallisce con messaggio di errore esplicito se un campo `json` risiede in una sezione con più di una colonna o è affiancato ad altri campi.
- [ ] `useLayoutBuilder` impedisce via `assignField` e `moveField` l'inserimento di campi `json` in sezioni multi-colonna o l'affiancamento con altri campi.
- [ ] `useLayoutBuilder` impedisce via `setSectionColumnCount` l'aumento delle colonne a più di 1 per sezioni contenenti campi `json`.
- [ ] `prepareSubmissionPayload` normalizza valori `""`, `"   "`, `null`, `undefined` associati a campi `json` in `{}` nel payload serializzato.
- [ ] `validateEntryJsonFields` intercetta stringhe JSON malformate restituendo `{ isValid: false, errorFieldLabel: ... }` e blocca il submit nel form delle entry.
- [ ] Zero dipendenze aggiunte ad `@beechcms/core` o `apps/api`.
- [ ] Tutti i test unitari di `@beechcms/core` e `apps/dashboard` passano con successo (`pnpm test`).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

I seguenti elementi sono tassativamente **FUORI SCOPO** per questo sprint e non devono essere implementati dall'agente di esecuzione:

1. **Integrazione CodeMirror 6 e Componenti Editor Visuale:** L'installazione dei pacchetti `@codemirror/*` o `codemirror`, la configurazione di temi, numeri di riga, folding gutters e l'aggiornamento visivo di `JsonEdit` in `apps/dashboard/src/components/fields/edit/json.tsx` sono differiti allo **Sprint 2 (`codemirror-json-editor`)** come tracciato in `output/backlog/ROADMAP.md`. In questo sprint il componente continua a usare il textarea di fallback esistente.
2. **Modifiche a tabelle o migrazioni D1:** Non è necessaria alcuna migrazione SQLite; il database memorizza già i campi JSON in colonne di testo tramite `serializeForDb`.
3. **Modifiche agli endpoint REST o handler di `apps/api`:** L'infrastruttura API in `apps/api/src/features/schema/schema.handler.ts` riusa per trasparenza i contratti di `@beechcms/core`.
4. **Supporto a sezioni multi-colonna (1/2, 1/3, 1/4) per JSON:** Respinto dalla regola architetturale Ponytail; il campo JSON è tassativamente confinato a sezioni a colonna singola full-width.
5. **JSON Schema runtime validation o dynamic tree view:** Esclusa qualsiasi validazione di schema custom a runtime o ispettore grafico ad albero.
