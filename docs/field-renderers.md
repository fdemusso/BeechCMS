# Field Renderers – Infrastruttura UI per i campi

Documentazione del **Registry Pattern** per la visualizzazione e modifica dei campi schema-driven nella dashboard Beech CMS.

**Vedi anche:**
- [Botanical Engine](botanical-engine.md) — tipi `Branch`, `Seed`, `BranchType`
- [Field types action plan](field-types-action-plan.md) — roadmap e fasi di implementazione

---

## 1. Obiettivo

Le viste (Table, Form, Kanban, Grid) non devono conoscere i dettagli di come è fatto un campo. Chiamano semplicemente:

- `<FieldDisplay branch={...} value={...} />` per la sola lettura
- `<FieldEdit branch={...} value={...} onChange={...} />` per la modifica

Il **registro** mappa ogni `BranchType` al sottomodulo corretto. Aggiungere un nuovo tipo significa creare due componenti e registrarli, senza toccare le viste.

---

## 2. Struttura della cartella

```
apps/dashboard/src/components/fields/
├── index.ts              # Re-export pubblici (FieldDisplay, FieldEdit, tipi, registry)
├── types.ts              # FieldDisplayProps, FieldEditProps
├── registry.ts           # Mappe BranchType → componente Display/Edit
├── FieldDisplay.tsx      # Entry point sola lettura (lookup + fallback)
├── FieldEdit.tsx         # Entry point edit (lookup + fallback)
├── default.tsx           # DefaultDisplay, DefaultEdit (fallback per tipi non registrati)
├── display/              # Sottomoduli sola lettura (uno per tipo)
│   ├── text.tsx
│   ├── number.tsx
│   ├── boolean.tsx
│   ├── date.tsx
│   ├── json.tsx
│   ├── richtext.tsx      # Strip HTML → testo troncato (ExpandableCell)
│   └── media.tsx        # Miniatura immagine o icona file
└── edit/                 # Sottomoduli edit (uno per tipo)
    ├── text.tsx
    ├── number.tsx
    ├── boolean.tsx
    ├── date.tsx
    ├── json.tsx
    ├── richtext.tsx      # TipTap editor con toolbar (Bold, Italic, H2, Liste)
    └── media.tsx         # Dropzone upload, anteprima, Sostituisci/Rimuovi
```

---

## 3. Contratti (props)

### FieldDisplayProps

| Prop | Tipo | Descrizione |
|------|------|-------------|
| `branch` | `Branch` | Definizione del campo (id, alias, label, type) |
| `value` | `unknown` | Valore da mostrare (da `entry.data[branch.alias]`) |
| `options` | `{ maxLength?: number }` | Opzionale. Usato per troncamento in tabella (text, json) |

### FieldEditProps

| Prop | Tipo | Descrizione |
|------|------|-------------|
| `branch` | `Branch` | Definizione del campo |
| `value` | `unknown` | Valore corrente |
| `onChange` | `(value: unknown) => void` | Callback al cambio valore |

---

## 4. Registro

Il file `registry.ts` espone:

- **displayRegistry**: `Partial<Record<BranchType, ComponentType<FieldDisplayProps>>>`
- **editRegistry**: `Partial<Record<BranchType, ComponentType<FieldEditProps>>>`
- **getDisplayComponent(type)**: restituisce il componente display o `DefaultDisplay`
- **getEditComponent(type)**: restituisce il componente edit o `DefaultEdit`

I tipi attualmente registrati: `text`, `number`, `boolean`, `date`, `json`, `richtext`, `file`.

---

## 5. Comportamento per tipo

| Tipo | Display | Edit |
|------|---------|------|
| `text` | Testo troncato (ExpandableCell) | `<Input type="text">` |
| `number` | Numero formattato (it-IT) | `<Input type="number" step="any">` |
| `boolean` | Badge "Sì"/"No" (verde/grigio) | Checkbox + label |
| `date` | Data formattata (it-IT, short) | `<Input type="date">` |
| `json` | Tags → Badge colorati collassabili; altro → testo monospace troncato | Textarea con hint JSON/tags |
| `richtext` | Testo plain troncato (strip HTML) | TipTap editor con toolbar (Bold, Italic, H2, Bullet List, Ordered List) |
| `file` | Miniatura immagine o icona file | Dropzone upload, anteprima, Sostituisci/Rimuovi (vedi [Media Engine](media-engine.md)) |
| *(non registrato)* | `DefaultDisplay`: stringa o "-" | `DefaultEdit`: `<Input type="text">` |

### Euristica JSON per i tag

Se l'alias del branch contiene la parola `"tag"` (case-insensitive) e il valore è un oggetto `Record<string, string>` (tag → colore), viene usato il renderer con Badge colorati collassabili. Altrimenti il JSON viene mostrato come testo formattato.

---

## 6. Consumatori

### Table View (`dynamic-columns.tsx`)

- `generateColumns` usa `FieldDisplay` per ogni cella dati
- `computeMaxLengths` calcola le lunghezze per troncamento e le passa via `options.maxLength`
- Nessuno `switch(branch.type)` nel file

### EntryEditorPage (`entry-editor.tsx`)

- Pagina fullscreen per la creazione e modifica di una entry (route `/content/:slug/create` e `/content/:slug/:id`)
- Per ogni branch: `<FieldEdit branch={branch} value={formData[branch.alias]} onChange={(val) => handleInputChange(branch.alias, val)} />`
- La validazione JSON al submit resta nella pagina (non delegata ai sottomoduli)
- Layout adattivo: se lo schema contiene un campo `richtext`, usa una griglia 70/30 (editor + sidebar); altrimenti usa una colonna singola centrata con Card per Pubblicazione, SEO e Contenuto

### Form View / Kanban View (Fase 3)

- Useranno gli stessi `FieldDisplay` e `FieldEdit` senza modifiche

---

## 7. Estensibilità

Per aggiungere un nuovo tipo (es. `url`, `slug`, `file`):

1. Estendere `BranchType` in `packages/core/src/types.ts`
2. Creare `display/<tipo>.tsx` e `edit/<tipo>.tsx`
3. Registrarli in `registry.ts`

Nessuna modifica a `FieldDisplay`, `FieldEdit`, Table View o `EntryEditorPage`.

---

## 8. Import

```ts
import { FieldDisplay, FieldEdit } from "@/components/fields"
```

Per accesso al registro o ai tipi:

```ts
import {
  FieldDisplay,
  FieldEdit,
  type FieldDisplayProps,
  type FieldEditProps,
  getDisplayComponent,
  getEditComponent,
} from "@/components/fields"
```
