# Sprint: codemirror-json-editor

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Nello Sprint 1 (`json-layout-core-and-form-contract`, archiviato in `docs/Sprints/json-layout-core-and-form-contract/`), abbiamo completato le fondamenta architetturali e i contratti del dato:
1. Promozione del tipo `json` a tipo di layout a tutta larghezza in `@beechcms/core` (`FULL_WIDTH_BRANCH_TYPES`), con isolamento obbligatorio a colonna singola (`validateLayoutAgainstSeed` e `generateDefaultLayout`).
2. Protezione interattiva nel Layout Builder (`use-layout-builder.ts`), impedendo il trascinamento in sezioni multicolonna e bloccando la suddivisione di colonne.
3. Blindatura del contratto form entry (`use-entry-editor-dialog.tsx`), bloccando la sottomissione in caso di JSON sintatticamente non valido e normalizzando i valori vuoti a `{}` prima dell'invio verso l'API e il database.

Questo secondo e conclusivo sprint (`codemirror-json-editor`) esiste per sostituire il fallback temporaneo della `<textarea>` monocromatica con un'esperienza di visual editing di livello enterprise basata su **CodeMirror 6** in `apps/dashboard`.

### Rispetto degli Invarianti di Architettura (VSA & Botanical Engine)
- **Botanical Invariant**: Il client non interagisce mai direttamente con SQLite o D1. Tutti i dati transitano attraverso le API form e il ciclo di vita `@beechcms/core` (`prepareSubmissionPayload`).
- **Vertical Slice Architecture (VSA)**: L'integrazione del visual editor è interamente confinata al livello condiviso di rendering dei campi (`apps/dashboard/src/components/fields/edit/`). Nessuna logica di parsing o visual editing trapela in `apps/api` o `@beechcms/core`. I moduli all'interno di `apps/dashboard/src/features/` non importano componenti privati l'uno dell'altro; interagiscono esclusivamente attraverso le interfacce form stabilite e `FieldEdit`.
- **YAGNI & Cloudflare Purity**: Si adotta CodeMirror 6 (modulare, leggero, zero worker esterni, perfettamente compatibile con SSR/Vite/Edge) scartando categoricamente Monaco Editor o visualizzatori ad albero sovradimensionati.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
Dall'analisi delle relazioni estratte tramite Graphify:
- `FieldEdit()` (`apps/dashboard/src/components/fields/FieldEdit.tsx`) risolve il renderer di modifica invocando `getEditComponent()` dal registro centralizzato `fieldRegistry` (`apps/dashboard/src/components/fields/registry.ts`).
- `registry.ts` registra `JsonEdit` (`apps/dashboard/src/components/fields/edit/json.tsx`) per i tipi branch `'json'` e `'tags'`.
- `JsonEdit` gestisce due modalità:
  1. Se `isTagsField && hasOptions`, renderizza la UI a badge colorati con popover di selezione da `branch.options` (funzionalità validata e da preservare intatta al 100%).
  2. Se non ha opzioni o è un campo JSON generico, renderizza attualmente un elemento `<textarea>` nativo privo di evidenziazione sintattica, numeri di riga, folding e segnalazione errori.
- `FieldEditProps` (`apps/dashboard/src/components/fields/types.ts`) dichiara solo `{ branch, value, onChange }`. Gli attributi di blocco modifica (`disabled` o `readOnly`) non sono formalizzati nell'interfaccia né propagati attraverso `FieldEdit` e `layout-elements.tsx`.
- `LayoutRenderer` (`apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx`) riceve la prop `isReadOnly?: boolean`, ma la propaga solo a livello di `<fieldset disabled={isReadOnly}>`, che non blocca un editor basato su contenteditable/CodeMirror 6 senza configurazione esplicita.

Dipendenze attuali di `apps/dashboard/package.json`: non includono alcun pacchetto `codemirror`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
Concrete modifiche e nuovi file prodotti in questo sprint:

1. `apps/dashboard/package.json`
   - Aggiunta delle dipendenze CodeMirror 6: `codemirror`, `@codemirror/lang-json`, `@codemirror/lint`, `@codemirror/theme-one-dark`.
2. `apps/dashboard/src/components/fields/types.ts`
   - Estensione di `FieldEditProps` con `readonly disabled?: boolean` e `readonly readOnly?: boolean`.
3. `apps/dashboard/src/components/fields/FieldEdit.tsx`
   - Inoltro delle proprietà `disabled` e `readOnly` al componente di edit estratto da `getEditComponent`.
4. `apps/dashboard/src/features/entry-editor/renderer/layout-elements.tsx`
   - Propagazione di `isReadOnly` da `TabSections` e `SectionRenderer` a `ColumnRenderer`, passando `disabled={isReadOnly}` e `readOnly={isReadOnly || Boolean((branch as unknown as { readOnly?: boolean }).readOnly)}` a `FieldEdit`.
5. `apps/dashboard/src/components/fields/edit/json-code-editor.tsx` (NUOVO)
   - Componente React isolato che monta l'istanza `EditorView` di CodeMirror 6 con:
     - `basicSetup` (numeri di riga, gutter folding, matching parentesi, history/undo, highlight riga attiva).
     - Supporto sintattico JSON (`@codemirror/lang-json`) con linter integrato `jsonParseLinter()`.
     - Compartment per il tema dinamico (chiaro / scuro tramite `next-themes` o dark class).
     - Compartment per la modalità `readOnly` (`EditorView.editable.of(!readOnly)` e `EditorState.readOnly.of(readOnly)`).
     - Supporto al line wrapping (`EditorView.lineWrapping`).
     - Gestione dell'altezza con scorrimento interno (`min-h-[160px]`, `max-h-[420px]`).
     - Sincronizzazione bidirezionale controllata dello stato senza loop di re-render.
6. `apps/dashboard/src/components/fields/edit/json.tsx`
   - Sostituzione della `<textarea>` con `<JsonCodeEditor>`, formattando i valori non testuali con `JSON.stringify(value, null, 2)` e inoltrando `readOnly`/`disabled`. Preservazione totale della logica tag badge con opzioni predefinite.
7. `apps/dashboard/src/test/fields/json-code-editor.test.tsx` (NUOVO)
   - Test unitari per il wrapper CodeMirror 6: montaggio, inizializzazione pretty-printed, emissione `onChange` su modifiche testuali, applicazione read-only e supporto dark mode.
8. `apps/dashboard/src/test/fields/json-edit.test.tsx` (NUOVO)
   - Test di integrazione per `JsonEdit`: instradamento verso tag chips quando `branch.options` è presente, ed instradamento verso `JsonCodeEditor` per branch JSON standard o tag aperti.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1: Aggiunta Dipendenze CodeMirror 6
Nel file `apps/dashboard/package.json`, inserire in `"dependencies"`:
```json
"codemirror": "^6.0.1",
"@codemirror/lang-json": "^6.0.1",
"@codemirror/lint": "^6.8.4",
"@codemirror/theme-one-dark": "^6.1.3"
```
Eseguire `pnpm install` per aggiornare il lockfile.

### Task 2: Estensione del Contratto `FieldEditProps`
Nel file `apps/dashboard/src/components/fields/types.ts`:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch } from "@beechcms/core"

/** Props condivise per i componenti di sola lettura (display) */
export interface FieldDisplayProps {
  readonly branch: Branch
  readonly value: unknown
  /** Opzioni di visualizzazione (es. troncamento in tabella) */
  readonly options?: {
    readonly maxLength?: number
    readonly compact?: boolean
  }
}

/** Props condivise per i componenti di edit */
export interface FieldEditProps {
  readonly branch: Branch
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  readonly disabled?: boolean
  readonly readOnly?: boolean
}
```

### Task 3: Inoltro Props in `FieldEdit.tsx`
Nel file `apps/dashboard/src/components/fields/FieldEdit.tsx`:
```typescript
export function FieldEdit(props: FieldEditProps) {
  const { branch } = props
  const { t } = useTranslation()
  const { privacy } = resolvePolicies(branch)

  if (privacy === 'hash') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {t("fields.restricted", "Restricted")}
        </span>
      </div>
    )
  }

  if (branch.options && branch.options.length > 0) {
    const SelectComponent = getEditComponent('select' as BranchType)
    return <SelectComponent {...props} />
  }

  const Component = getEditComponent(branch.type)
  return <Component {...props} />
}
```
Assicurarsi che tutte le props (inclusi `disabled` e `readOnly`) vengano inoltrate a `SelectComponent` e `Component` via `{...props}`.

### Task 4: Propagazione di `isReadOnly` nel Renderer
Nel file `apps/dashboard/src/features/entry-editor/renderer/layout-elements.tsx`:
1. Aggiornare le interfacce per accogliere `isReadOnly?: boolean`:
```typescript
export interface ColumnRendererProps {
  readonly column: LayoutColumn
  readonly branchById: RendererBranchMap
  readonly formData: Record<string, unknown>
  readonly fieldErrors: Record<string, string>
  readonly onChange: (alias: string, value: unknown) => void
  readonly isReadOnly?: boolean
}

export interface SectionRendererProps {
  readonly section: LayoutSection
  readonly isLast: boolean
  readonly branchById: RendererBranchMap
  readonly formData: Record<string, unknown>
  readonly fieldErrors: Record<string, string>
  readonly onChange: (alias: string, value: unknown) => void
  readonly isReadOnly?: boolean
}

export interface TabSectionsProps {
  readonly tab: LayoutTab
  readonly branchById: RendererBranchMap
  readonly formData: Record<string, unknown>
  readonly fieldErrors: Record<string, string>
  readonly onChange: (alias: string, value: unknown) => void
  readonly isReadOnly?: boolean
}
```
2. In `TabSections`, inoltrare `isReadOnly` a `SectionRenderer`.
3. In `SectionRenderer`, inoltrare `isReadOnly` a `ColumnRenderer`.
4. In `ColumnRenderer`:
```typescript
<FieldEdit
  branch={branch as any}
  value={formData[branch.alias]}
  onChange={(value) => onChange(branch.alias, value)}
  disabled={isReadOnly}
  readOnly={isReadOnly || Boolean((branch as unknown as { readOnly?: boolean }).readOnly)}
/>
```
5. In `apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx`, passare `isReadOnly={isReadOnly}` alla chiamata `<TabSections ... />`.

### Task 5: Implementazione di `JsonCodeEditor`
Creare il nuovo file `apps/dashboard/src/components/fields/edit/json-code-editor.tsx`:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { basicSetup, EditorView } from "codemirror"
import { EditorState, Compartment } from "@codemirror/state"
import { json, jsonParseLinter } from "@codemirror/lang-json"
import { linter, lintGutter } from "@codemirror/lint"
import { oneDark } from "@codemirror/theme-one-dark"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export interface JsonCodeEditorProps {
  readonly id?: string
  readonly value: unknown
  readonly onChange: (value: string) => void
  readonly readOnly?: boolean
  readonly placeholder?: string
  readonly className?: string
}

function formatInitialValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value == null) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const beechBaseTheme = EditorView.theme({
  "&": {
    fontSize: "0.875rem",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    backgroundColor: "transparent",
    height: "100%",
    minHeight: "160px",
    maxHeight: "420px",
  },
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.5",
    fontFamily: "inherit",
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "currentColor",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid hsl(var(--border) / 0.6)",
    color: "hsl(var(--muted-foreground) / 0.8)",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--accent) / 0.4)",
    color: "hsl(var(--foreground))",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--accent) / 0.2)",
  },
  ".cm-foldGutter": {
    paddingRight: "4px",
  },
})

export function JsonCodeEditor({
  id,
  value,
  onChange,
  readOnly = false,
  placeholder,
  className,
}: JsonCodeEditorProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const themeCompartment = React.useRef(new Compartment())
  const readOnlyCompartment = React.useRef(new Compartment())

  const formattedInitial = React.useMemo(() => formatInitialValue(value), [])
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange

  // Inizializzazione di CodeMirror
  React.useEffect(() => {
    if (!containerRef.current) return

    const startState = EditorState.create({
      doc: formattedInitial,
      extensions: [
        basicSetup,
        json(),
        lintGutter(),
        linter(jsonParseLinter()),
        EditorView.lineWrapping,
        beechBaseTheme,
        themeCompartment.current.of(isDark ? [oneDark] : []),
        readOnlyCompartment.current.of([
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // Sincronizzazione dinamica del tema
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: themeCompartment.current.reconfigure(isDark ? [oneDark] : []),
    })
  }, [isDark])

  // Sincronizzazione dinamica di readOnly
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
    })
  }, [readOnly])

  // Sincronizzazione controllata del valore da sorgente esterna
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    const nextString = typeof value === "string" ? value : formatInitialValue(value)

    if (nextString !== currentDoc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: nextString,
        },
      })
    }
  }, [value])

  return (
    <div
      id={id}
      data-testid="json-code-editor"
      ref={containerRef}
      className={cn(
        "relative w-full rounded-md border border-input bg-background text-foreground shadow-xs transition-colors",
        "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden",
        readOnly && "cursor-not-allowed opacity-75 bg-muted/30",
        className
      )}
    />
  )
}
```

### Task 6: Integrazione in `JsonEdit` (`apps/dashboard/src/components/fields/edit/json.tsx`)
Aggiornare `apps/dashboard/src/components/fields/edit/json.tsx`:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, Plus, X } from 'reicon-react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FieldEditProps } from "../types"
import { JsonCodeEditor } from "./json-code-editor"

function parseTagsValue(value: unknown): Record<string, string> {
  if (!value) return {}
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, string>
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, string>
    } catch {
      // ignore
    }
  }
  return {}
}

export function JsonEdit({ branch, value, onChange, disabled, readOnly: propReadOnly }: FieldEditProps) {
  const isTagsField = branch.type === "tags" || branch.alias.toLowerCase().includes("tag")
  const hasOptions = isTagsField && (branch.options?.length ?? 0) > 0
  const isReadOnly = Boolean(propReadOnly || disabled || (branch as unknown as { readOnly?: boolean }).readOnly)
  const [isAddOpen, setIsAddOpen] = React.useState(false)

  if (isTagsField && hasOptions) {
    const currentTags = parseTagsValue(value)
    const predefinedOptions = branch.options ?? []

    const DEFAULT_COLORS = [
      "#3b82f6", "#06b6d4", "#8b5cf6", "#10b981",
      "#f59e0b", "#ef4444", "#ec4899", "#64748b",
    ]

    const toggleTag = (tag: string) => {
      if (isReadOnly) return
      const next = { ...currentTags }
      if (!Object.hasOwn(next, tag) || next[tag] === undefined) {
        const idx = Object.keys(next).length % DEFAULT_COLORS.length
        next[tag] = DEFAULT_COLORS[idx]
      } else {
        delete next[tag]
      }
      onChange(next)
    }

    const activeEntries = Object.entries(currentTags).filter(([key]) =>
      Object.hasOwn(currentTags, key)
    )
    const availableOptions = predefinedOptions.filter(
      (opt: string) => !Object.hasOwn(currentTags, opt) || currentTags[opt] === undefined
    )

    return (
      <div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          {activeEntries.length > 0 ? (
            activeEntries.map(([tag, color]) => (
              <button
                key={tag}
                type="button"
                disabled={isReadOnly}
                onClick={() => toggleTag(tag)}
                className="group relative min-w-0 max-w-full disabled:cursor-not-allowed"
                aria-label={`Remove tag ${tag}`}
                title={tag}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none border-transparent pr-2 transition min-w-0 max-w-full"
                  style={{
                    backgroundColor: color,
                    color: "#fff",
                    borderColor: color,
                  }}
                >
                  <span className="block min-w-0 max-w-[260px] truncate">{tag}</span>
                </Badge>
                {!isReadOnly && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-destructive/90 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <X className="size-3.5" />
                  </span>
                )}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No tags selected</span>
          )}

          {!isReadOnly && (
            <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-6 rounded-full"
                  aria-label="Add tag"
                >
                  <Plus className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 max-w-full p-2">
                <div className="mb-2 text-xs text-muted-foreground">
                  Select a tag from the seed
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {predefinedOptions.map((opt: string) => {
                    const isActive = Object.hasOwn(currentTags, opt) && currentTags[opt] !== undefined
                    return (
                      <button
                        key={opt}
                        type="button"
                        title={opt}
                        onClick={() => {
                          toggleTag(opt)
                          if (isActive) return
                          setIsAddOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-accent/70 text-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <span className="min-w-0 max-w-[200px] truncate">{opt}</span>
                        {isActive ? <Check className="size-4 shrink-0" /> : null}
                      </button>
                    )
                  })}
                  {availableOptions.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      All tags from the seed are already selected.
                    </p>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    )
  }

  const helperText = isTagsField
    ? 'Tag→color object, e.g.: {"cms": "blue", "react": "green"}'
    : 'JSON object, e.g.: {"client": "Name"}'

  return (
    <div className="space-y-1">
      <JsonCodeEditor
        id={branch.alias}
        value={value}
        onChange={(text) => onChange(text)}
        readOnly={isReadOnly}
      />
      <p className="text-xs text-muted-foreground">
        {helperText}
      </p>
    </div>
  )
}
```

### Task 7: Unit & Regression Test Suite
Creare `apps/dashboard/src/test/fields/json-code-editor.test.tsx`:
- Render di `JsonCodeEditor` in ambiente Vitest / JSDOM.
- Verifica della presenza degli elementi DOM generati da CodeMirror (`.cm-editor`, `.cm-scroller`, `.cm-content`, `.cm-gutters`).
- Verifica del pretty-printing dell'oggetto in input (`JSON.stringify(..., null, 2)`).
- Verifica del supporto `readOnly`: quando `readOnly={true}`, la classe `cursor-not-allowed` viene applicata e l'editor viene impostato a non editabile.

Creare `apps/dashboard/src/test/fields/json-edit.test.tsx`:
- Verifica che per branch con `type: 'tags'` e opzioni predefinite, continui a essere visualizzata la UI a chip (preservando i test esistenti in `edit-tags.test.tsx`).
- Verifica che per branch con `type: 'json'`, o tags aperti, venga montato `JsonCodeEditor`.
- Verifica della trasmissione di `readOnly` e `disabled` verso `JsonCodeEditor`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Tutti i controlli devono passare con exit code 0:

```bash
# 1. Installazione e verifica integrità dipendenze
pnpm install

# 2. Type-check dell'applicazione Dashboard
pnpm --filter @beechcms/dashboard run type-check

# 3. Test unitari e di componente della Dashboard
pnpm --filter @beechcms/dashboard test

# 4. Build dell'applicazione Dashboard
pnpm --filter @beechcms/dashboard run build

# 5. Esecuzione suite consolidata dell'intero monorepo
pnpm test

# 6. Sincronizzazione del grafo architetturale
graphify update .
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] CodeMirror 6 (`codemirror`, `@codemirror/lang-json`, `@codemirror/lint`, `@codemirror/theme-one-dark`) è aggiunto in `apps/dashboard/package.json` ed è installato senza conflitti di peer dependencies.
- [ ] `FieldEditProps` espone `readonly disabled?: boolean` e `readonly readOnly?: boolean`.
- [ ] `layout-elements.tsx` e `layout-renderer.tsx` propagano lo stato `isReadOnly` a tutti i campi tramite `FieldEdit`.
- [ ] Il componente `JsonCodeEditor` monta CodeMirror 6 con evidenziazione sintattica, numeri di riga laterali, folding e matching parentesi.
- [ ] `JsonCodeEditor` include linter inline per evidenziare tempestivamente errori sintattici nel gutter e nel testo.
- [ ] `JsonCodeEditor` sincronizza in tempo reale il testo digitato con il form chiamante senza causare errori a runtime.
- [ ] `JsonCodeEditor` formattata e indenta automaticamente a 2 spazi gli oggetti JSON validi passati come valore iniziale.
- [ ] Quando `readOnly` o `disabled` è true, l'editor impedisce la digitazione ma permette la selezione del testo, il folding dei blocchi e la lettura chiara del contenuto formattato.
- [ ] I campi di tipo `tags` con opzioni predefinite conservano la precedente interfaccia a chip colorati e popover di aggiunta.
- [ ] Non sono presenti query D1 o modifiche dirette al database in `apps/dashboard`.
- [ ] Zero dipendenze aggiunte a `@beechcms/core` o `apps/api`.
- [ ] `pnpm --filter @beechcms/dashboard run type-check` termina con 0 errori.
- [ ] Tutti i test di `apps/dashboard` passano con successo (inclusi i test di regressione del Layout Builder e dell'Entry Form).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Monaco Editor / VS Code Embedded**: Non ammesso. L'integrazione è tassativamente limitata a CodeMirror 6 per garantire leggerezza ed esecuzione immediata senza web workers.
- **Tree View / Schema Form Dinamico**: Nessun visualizzatore o editor grafico ad albero. L'editor resta focalizzato sul testo strutturato JSON.
- **Validazione contro JSON Schema personalizzato**: Nessuna convalida a runtime contro schemi JSON Schema o AJV complessi. La convalida copre la correttezza del formato JSON standard.
- **Modifiche a `@beechcms/core` o `apps/api`**: Nessun ritocco alle logiche di layout del Core o agli endpoint dell'API (già completati e blindati nello Sprint 1).
- **Nuove proprietà di visibilità nel branch**: Nessun attributo custom aggiunto ai Seed per governare la visibilità dei campi.
