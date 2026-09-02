# Roadmap: JSON Field Layout Support & CodeMirror 6 Visual Editor

Multi-sprint roadmap for full JSON field support in BeechCMS across the Core Layout Engine, Layout Builder, Form Validation/Lifecycle, and CodeMirror 6 Visual Editing.

---

### Sprint 1: `json-layout-core-and-form-contract` [SHIPPED]
- **Goal:** Sbloccare il supporto nativo per i campi JSON nel motore di layout di `@beechcms/core` con vincolo a tutta larghezza (sezione a colonna singola dedicata), integrare i blocchi di validazione e drag-and-drop nel Layout Builder di `apps/dashboard`, e blindare il contratto dati del form entry (validazione sintattica pre-submit e normalizzazione automatica del vuoto a `{}`).
- **Status:** COMPLETED & ARCHIVED (`docs/Sprints/json-layout-core-and-form-contract/`).
- **Shipped Deliverables:**
  - `@beechcms/core`: Rimozione di `json` da `UNSUPPORTED_BRANCH_TYPES` e promozione a `FULL_WIDTH_BRANCH_TYPES`. Rafforzamento di `validateLayoutAgainstSeed` (sezione dedicata a colonna singola `columns.length === 1` e `fieldsInSection.length === 1`). Generazione automatica di sezioni 1-colonna dedicate in `generateDefaultLayout`. Test in `packages/core/src/dashboard-layout/seed-layout.test.ts`.
  - `apps/dashboard/features/entry-editor/builder`: Vincoli `wouldViolateFullWidthWithMap` e blocco `setSectionColumnCount` in `use-layout-builder.ts`. Disabilitazione selettore colonne e messaggi di avviso in `section-card.tsx` e `layout-builder-dialog.tsx`.
  - `apps/dashboard/features/entry-editor/hooks`: Validazione pre-submit `validateEntryJsonFields` e normalizzazione `{}` in `prepareSubmissionPayload` (`use-entry-editor-dialog.tsx`). Test in `apps/dashboard/src/test/features/entry-editor/entry-json-form.test.ts`.
- **Dependency:** Nessuna.

---

### Sprint 2: `codemirror-json-editor` [CURRENT]
- **Goal:** Integrare in `apps/dashboard` l'editor visuale specializzato basato su CodeMirror 6, con evidenziazione sintattica colorata, numeri di riga, folding di oggetti/array, corrispondenza parentesi, vincoli di scorrimento (min/max height) e supporto alla modalità read-only.
- **Status:** READY FOR EXECUTION.
- **Deliverables:**
  - `apps/dashboard/package.json`: Aggiunta dipendenze CodeMirror 6 (`codemirror`, `@codemirror/lang-json`, `@codemirror/lint`, `@codemirror/theme-one-dark`).
  - `apps/dashboard/src/components/fields/types.ts`: Estensione dell'interfaccia `FieldEditProps` con `disabled?: boolean` e `readOnly?: boolean`.
  - `apps/dashboard/src/components/fields/FieldEdit.tsx`: Propagazione degli stati `disabled` e `readOnly` verso i componenti di edit registrati.
  - `apps/dashboard/src/features/entry-editor/renderer/layout-elements.tsx`: Inoltro di `isReadOnly` da `TabSectionsProps` / `RendererProps` a `FieldEdit`.
  - `apps/dashboard/src/components/fields/edit/json-code-editor.tsx`: Componente wrapper CodeMirror 6 con tema adattivo (chiaro/scuro), autocompletamento JSON, evidenziazione sintattica, gutter con numeri di riga e code folding, bracket matching, linting sintattico inline, altezza min/max e line wrapping.
  - `apps/dashboard/src/components/fields/edit/json.tsx`: Sostituzione della `<textarea>` monocromatica con `JsonCodeEditor`, preservando al 100% la gestione preesistente dei tag con chip colorati (`isTagsField && hasOptions`).
  - Test unitari e di regressione in `apps/dashboard/src/test/fields/json-code-editor.test.tsx` e `apps/dashboard/src/test/fields/edit-tags.test.tsx`.
- **Dependency:** Dipende da `json-layout-core-and-form-contract` (Sprint 1), che fornisce il contenitore full-width nel layout form e il ciclo di vita validato del dato.
