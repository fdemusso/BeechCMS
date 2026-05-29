# Sprint Route Correction: Specifica `fileOptions` e riorganizzazione gestione media

Questo documento è una **specifica eseguibile**: ogni task contiene path assoluti, snippet del codice attuale, contratti precisi e criteri di accettazione. Un agente IA deve poterla completare senza ulteriore navigazione del codice (a parte i file elencati).

> Versione: 1.0 — Allineata con il codice su branch `seed-bugfix` al commit `6408d18`.

---

## 0. Convenzioni e default (READ-FIRST)

| Decisione | Valore | Motivo |
|---|---|---|
| `FileFieldOptions.accept` default | `'any'` | Se l'utente non specifica `fileOptions`, il campo deve accettare qualsiasi URL valido e **non rendere nulla** (icona generica, nessun tentativo di caricare immagine). |
| `FileFieldOptions.maxSize` default | `5 * 1024 * 1024` (5 MB) | Allinea il default backend storico (`MAX_FILE_SIZE_BYTES` in `upload.ts`). |
| Validazione MIME a runtime su URL esterni | **Non implementata** (best-effort sulla sola estensione) | Le URL esterne non possono essere ispezionate senza fetch sincrono; il gate vero è l'endpoint `/upload`. |
| Lookup `media_objects` durante Zod refine | **Vietato** | Zod transforms sono sincroni; non è ammesso fare query D1 per ogni campo validato. |
| Retrocompatibilità | I seed esistenti con `type: 'file'` senza `fileOptions` cambiano comportamento (prima `image/*` di fatto, ora `any`). | I template (`bin/templates/*`) e i test (`apps/api/test/fixtures.ts`, `packages/core/src/validation.test.ts`) devono essere aggiornati per dichiarare `fileOptions: { accept: 'image' }` dove il significato semantico era "immagine". |

---

## 1. Contesto e parti coinvolte

### 1.1 File attualmente coinvolti (single source of truth)

| Layer | File | Rilevanza |
|---|---|---|
| Core types | `packages/core/src/types.ts` | Definisce `Branch`, `BranchType`, `NumberFieldOptions`. Punto di estensione per `FileFieldOptions`. |
| Core validation | `packages/core/src/validation.ts` | `buildFileSchema` (L372–401), `seedFingerprint` (L436–449), helpers `normalizeHttpUrl` (L47), `normalizeAssetListValue` (L78). |
| Core engine | `packages/core/src/engine.ts` | Mappa SQL (file → TEXT). `normalizeAssetListValue` (L79). **Nessuna modifica SQL richiesta** (lo storage rimane TEXT). |
| API upload | `apps/api/src/upload.ts` | `ALLOWED_MIME_PREFIXES` (L11), `MAX_FILE_SIZE_BYTES` (L14). |
| Dashboard edit | `apps/dashboard/src/features/fields/edit/media.tsx` | `IMAGE_ACCEPT` (L24), `handleFileUpload` (L157, controllo `startsWith("image/")` L159), `<input accept>` (L371, L557). |
| Dashboard display | `apps/dashboard/src/features/fields/display/media.tsx` | Renderizza tutto come `<AvatarImage>` (L54, L74). Fallback `FileIcon` solo `onerror`. |
| Field registry | `apps/dashboard/src/features/fields/registry.ts` | Mappa `file` → `MediaDisplay`/`MediaEdit`. |
| Test fixtures API | `apps/api/test/fixtures.ts` | `TEST_SEEDS[0].branches` contiene `{ alias: 'image', type: 'file' }`. |
| Test fixtures Core | `packages/core/src/validation.test.ts` | `CHAOS_SEED.branches` con `cover` e `gallery`. |
| Test dashboard | `apps/dashboard/src/test/fields/edit-media.test.tsx`, `display-media.test.tsx` | `mockBranch`, `mockAssetListBranch`. |
| i18n | `apps/dashboard/src/locales/en.json` e `it.json`, sezione `"media"` (~L517 en). | Aggiungere chiavi per errori `document`/`any` (Task 7). |
| Templates CLI | `bin/templates/{blog,empty,gallery}.ts` | Contengono campi `type: 'file'` senza opzioni. |
| Docs | `docs/architecture.md`, `docs/api-reference.md`, `docs/guide.md` | Sezioni che descrivono il tipo `file`. |

### 1.2 Snippet del codice attuale (per riferimento, NON rileggere)

**`packages/core/src/types.ts` (L33–80, sezione `Branch`)**
```typescript
export interface Branch {
  alias: string
  label: string
  type: BranchType
  format?: 'plain' | 'markdown' | 'html' | 'date' | 'datetime' | 'asset-list'
  multiple?: boolean
  options?: string[]
  requiredOnCreate?: boolean
  requiredOnUpdate?: boolean
  policies?: { /* ... */ }
  numberOptions?: NumberFieldOptions
}
```

**`packages/core/src/validation.ts` L372–401 — `buildFileSchema`**
```typescript
function buildFileSchema(branch: Branch, allowNull: boolean, nullable: z.ZodNull | null) {
  if (isAssetListBranch(branch)) {
    const schema = getPreprocessEmpty(allowNull)(
      z.any()
        .transform((rawValue, ctx) => {
          const normalized = normalizeAssetListValue(rawValue)
          if (!normalized) { ctx.addIssue({ code: 'custom', message: 'Expected url-string[]' }); return z.NEVER }
          return normalized
        })
        .pipe(z.array(z.string().url()))
    )
    return nullable ? z.union([schema, nullable]) : schema
  }
  const schema = getPreprocessEmpty(allowNull)(
    z.any()
      .transform((rawValue, ctx) => {
        const normalized = normalizeHttpUrl(rawValue)
        if (!normalized) { ctx.addIssue({ code: 'custom', message: 'Expected url-string' }); return z.NEVER }
        return normalized
      })
      .pipe(z.string().url())
  )
  return nullable ? z.union([schema, nullable]) : schema
}
```

**`packages/core/src/validation.ts` L436–449 — `seedFingerprint`**
```typescript
function seedFingerprint(seed: Seed): string {
  return JSON.stringify({
    slug: seed.slug,
    branches: seed.branches.map((branch) => ({
      alias: branch.alias,
      type: branch.type,
      format: branch.format ?? null,
      multiple: branch.multiple ?? false,
      requiredOnCreate: branch.requiredOnCreate ?? false,
      requiredOnUpdate: branch.requiredOnUpdate ?? false,
      numberOptions: branch.numberOptions ?? null,
    })),
  })
}
```

**`apps/api/src/upload.ts` L10–14**
```typescript
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
```

**`apps/dashboard/src/features/fields/display/media.tsx` L37–80**
```typescript
export function MediaDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null || value === "") return <div className="text-muted-foreground">-</div>
  if (isAssetListBranch(branch)) { /* renderizza ogni URL come <AvatarImage> */ }
  const url = parseSingleUrl(value)
  if (!url) return <div className="text-muted-foreground">-</div>
  return (
    <Avatar className="...">
      <AvatarImage src={url} alt="" className="object-cover" />
      <AvatarFallback className="..."><FileIcon className="..." /></AvatarFallback>
    </Avatar>
  )
}
```

---

## 2. Catalogo MIME / estensioni supportate

Da usare in **upload.ts** e nelle helper di validazione. Mantenere in una costante condivisa (`packages/core/src/file-types.ts`, nuovo file — vedi Task 1).

| `accept` | MIME prefix accettati | Estensioni (case-insensitive) |
|---|---|---|
| `image` | `image/` | `.jpg .jpeg .png .gif .webp .svg .avif .bmp .ico` |
| `document` | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `text/csv`, `text/markdown` | `.pdf .doc .docx .xls .xlsx .ppt .pptx .txt .csv .md` |
| `any` | tutti i precedenti **+** `application/zip`, `application/x-zip-compressed`, `application/x-7z-compressed`, `application/x-tar`, `application/gzip`, `application/json` | tutte le precedenti + `.zip .7z .tar .gz .json` |

> L'endpoint `/upload` non conosce il branch; applica sempre l'unione (`any`). La validazione semantica per branch avviene a salvataggio entry tramite Zod.

---

## 3. Architettura di validazione (due fasi)

```
[Client]
  │ 1. POST /upload (multipart)  ──> Filtro MIME generico = unione "any"
  │                                  Limite size = MAX_FILE_SIZE_BYTES (5MB)
  │                                  Ritorna { url }
  │
  │ 2. POST /api/v1/public/:seed/add (JSON body con url nel campo)
  │                                  ──> validateAndSanitizeSeedPayload
  │                                       └─> buildFileSchema(branch)
  │                                            └─> resolveFileOptions(branch).accept
  │                                                 └─> match URL extension vs allowlist
```

**Regole di validazione del campo (Zod refine sincrono, no DB):**

1. URL deve passare `normalizeHttpUrl` (già implementato, L47).
2. Se `accept === 'any'`: nessun ulteriore controllo.
3. Se `accept === 'image'` o `'document'`: estrai estensione da `new URL(value).pathname`. Se assente o non in allowlist → emetti issue `Expected file(accept:${accept})`.
4. URL senza estensione esplicita (es. `/api/media/abc123` senza suffisso) sono **ammessi** quando `accept !== 'any'` solo se l'host corrisponde al bucket interno (env-aware: opzionale, vedi Task 5 — fallback: rifiutare). Decisione di default: **rifiutare con messaggio chiaro**, l'utente può ri-uploadare con estensione.

---

## 4. Sprint Backlog — task atomici

Ogni task è auto-contenuto. Eseguire in ordine. Non riordinare senza motivo.

### Task 1 — Catalogo file types condiviso (`@beechcms/core`)
**Path:** `packages/core/src/file-types.ts` (NEW)
**Export aggiunti a `packages/core/src/index.ts`.**

Definire:
```typescript
export type FileAccept = 'image' | 'document' | 'any'

export const IMAGE_EXTENSIONS = new Set(['jpg','jpeg','png','gif','webp','svg','avif','bmp','ico'])
export const DOCUMENT_EXTENSIONS = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','md'])
export const ARCHIVE_EXTENSIONS = new Set(['zip','7z','tar','gz','json'])

export const IMAGE_MIME_PREFIXES = ['image/'] as const
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
] as const
export const ARCHIVE_MIME_TYPES = [
  'application/zip','application/x-zip-compressed','application/x-7z-compressed',
  'application/x-tar','application/gzip','application/json',
] as const

export function extensionFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const dot = path.lastIndexOf('.')
    if (dot < 0 || dot === path.length - 1) return null
    return path.slice(dot + 1).toLowerCase()
  } catch { return null }
}

export function isExtensionAccepted(ext: string | null, accept: FileAccept): boolean {
  if (accept === 'any') return true
  if (ext == null) return false
  if (accept === 'image') return IMAGE_EXTENSIONS.has(ext)
  if (accept === 'document') return DOCUMENT_EXTENSIONS.has(ext)
  return false
}

export function isMimeAccepted(mime: string, accept: FileAccept): boolean {
  if (accept === 'any') {
    return IMAGE_MIME_PREFIXES.some(p => mime.startsWith(p))
      || (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)
      || (ARCHIVE_MIME_TYPES as readonly string[]).includes(mime)
  }
  if (accept === 'image') return IMAGE_MIME_PREFIXES.some(p => mime.startsWith(p))
  if (accept === 'document') return (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)
  return false
}
```

**Accettazione:** `npm --workspace packages/core run build` compila; nuove costanti esportate da `index.ts`.

---

### Task 2 — Tipi `FileFieldOptions` + estensione `Branch` (`@beechcms/core`)
**Path:** `packages/core/src/types.ts`

1. Aggiungere `import type { FileAccept } from './file-types.js'` in cima.
2. Inserire dopo `NumberFieldOptions` (dopo L30):
   ```typescript
   /** Configurazioni specializzate per il tipo di branch 'file' */
   export interface FileFieldOptions {
     /**
      * Tipo semantico di file accettato.
      * - 'image': immagini renderizzabili come anteprima
      * - 'document': PDF/Office/text
      * - 'any': qualsiasi file (default — UI mostra icona generica, nessun tentativo di render immagine)
      * Default: 'any'.
      */
     accept?: FileAccept
     /**
      * Dimensione massima del singolo file in byte.
      * NOTA: il backend /upload applica MAX_FILE_SIZE_BYTES (5MB) globale —
      * questo campo è informativo per la UI; non viene enforced in upload (vedi Task 3).
      * Default: 5_242_880.
      */
     maxSize?: number
   }
   ```
3. Aggiungere a `Branch` (dopo `numberOptions?` L79):
   ```typescript
   /** Opzioni avanzate per i campi file. Ignorato se type !== 'file' */
   fileOptions?: FileFieldOptions
   ```
4. Esportare `FileFieldOptions` da `packages/core/src/index.ts` (e ri-esportare `FileAccept` se non già da Task 1).

**Accettazione:**
- `tsc -b` passa per `@beechcms/core`.
- `apps/api` e `apps/dashboard` ancora compilano (campo opzionale → no break).

---

### Task 3 — Estensione `ALLOWED_MIME_PREFIXES` upload API (`apps/api`)
**Path:** `apps/api/src/upload.ts`

1. Sostituire `ALLOWED_MIME_PREFIXES` (L11) con import e funzione check:
   ```typescript
   import { isMimeAccepted } from '@beechcms/core'
   // ... rimuovere const ALLOWED_MIME_PREFIXES
   ```
2. In L95–98, sostituire:
   ```typescript
   const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
   if (!mimeOk) return c.json({ error: 'File type not allowed. Allowed: images and PDF' }, 400)
   ```
   con:
   ```typescript
   const mimeOk = isMimeAccepted(file.type, 'any')
   if (!mimeOk) return c.json({ error: 'File type not allowed' }, 400)
   ```
3. **Non** introdurre enforcement per-branch in upload (è esplicitamente fuori scope: il client non passa `seed`/`branch` a `/upload`).
4. Mantenere `MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024` come gate globale.

**Accettazione:**
- Test `apps/api/test/flow-media-assets.test.ts` esistenti passano (file image continuano a essere accettati).
- Aggiungere assertion `it('accetta zip e csv')` nello stesso file, mockando `file.type = 'application/zip'` e `'text/csv'` → 200 OK con URL.
- Aggiungere assertion `it('rifiuta application/x-msdownload')` → 400.

---

### Task 4 — `resolveFileOptions()` helper + `seedFingerprint` (`@beechcms/core`)
**Path:** `packages/core/src/validation.ts`

1. Aggiungere import: `import type { FileAccept } from './file-types.js'`
2. Aggiungere helper sotto gli helper esistenti (dopo `isAssetListBranch`, L46):
   ```typescript
   export function resolveFileOptions(branch: Branch): { accept: FileAccept; maxSize: number } {
     return {
       accept: branch.fileOptions?.accept ?? 'any',
       maxSize: branch.fileOptions?.maxSize ?? 5 * 1024 * 1024,
     }
   }
   ```
3. **Aggiornare `seedFingerprint` (L436–449)** aggiungendo `fileOptions`:
   ```typescript
   branches: seed.branches.map((branch) => ({
     alias: branch.alias,
     type: branch.type,
     format: branch.format ?? null,
     multiple: branch.multiple ?? false,
     requiredOnCreate: branch.requiredOnCreate ?? false,
     requiredOnUpdate: branch.requiredOnUpdate ?? false,
     numberOptions: branch.numberOptions ?? null,
     fileOptions: branch.fileOptions ?? null,
   })),
   ```
   *Motivo:* la cache schema compilata (`compiledSchemaCache`, L434) deve invalidare quando cambiano `fileOptions`.

**Accettazione:** `tsc -b` passa, nessun test esistente regressione.

---

### Task 5 — Validazione Zod per `accept` (`@beechcms/core`)
**Path:** `packages/core/src/validation.ts`, funzione `buildFileSchema` (L372–401)

Modificare il singolo URL e l'asset-list per applicare il check d'estensione:

```typescript
import { extensionFromUrl, isExtensionAccepted } from './file-types.js'

function buildFileSchema(branch: Branch, allowNull: boolean, nullable: z.ZodNull | null) {
  const { accept } = resolveFileOptions(branch)

  const checkAccept = (url: string, ctx: z.RefinementCtx): boolean => {
    if (accept === 'any') return true
    const ext = extensionFromUrl(url)
    if (!isExtensionAccepted(ext, accept)) {
      ctx.addIssue({ code: 'custom', message: `Expected file(accept:${accept})` })
      return false
    }
    return true
  }

  if (isAssetListBranch(branch)) {
    const schema = getPreprocessEmpty(allowNull)(
      z.any().transform((rawValue, ctx) => {
        const normalized = normalizeAssetListValue(rawValue)
        if (!normalized) { ctx.addIssue({ code: 'custom', message: 'Expected url-string[]' }); return z.NEVER }
        for (const url of normalized) {
          if (!checkAccept(url, ctx)) return z.NEVER
        }
        return normalized
      }).pipe(z.array(z.string().url()))
    )
    return nullable ? z.union([schema, nullable]) : schema
  }

  const schema = getPreprocessEmpty(allowNull)(
    z.any().transform((rawValue, ctx) => {
      const normalized = normalizeHttpUrl(rawValue)
      if (!normalized) { ctx.addIssue({ code: 'custom', message: 'Expected url-string' }); return z.NEVER }
      if (!checkAccept(normalized, ctx)) return z.NEVER
      return normalized
    }).pipe(z.string().url())
  )
  return nullable ? z.union([schema, nullable]) : schema
}
```

**Accettazione:** vedi Task 6.

---

### Task 6 — Test unitari validazione (`@beechcms/core`)
**Path:** `packages/core/src/validation.test.ts`

1. Estendere `CHAOS_SEED.branches` (L22) aggiungendo:
   ```typescript
   { alias: 'avatar',   label: 'Avatar',   type: 'file', fileOptions: { accept: 'image' } },
   { alias: 'manual',   label: 'Manual',   type: 'file', fileOptions: { accept: 'document' } },
   { alias: 'archive',  label: 'Archive',  type: 'file', fileOptions: { accept: 'any' } },
   { alias: 'docs',     label: 'Docs',     type: 'file', multiple: true, format: 'asset-list', fileOptions: { accept: 'document' } },
   ```
2. Aggiungere `describe('fileOptions', () => { ... })` con almeno:
   - `accept: 'image'` accetta `https://x.com/a.png`, `https://x.com/A.JPEG?q=1`.
   - `accept: 'image'` rifiuta `https://x.com/a.pdf` (issue `Expected file(accept:image)`).
   - `accept: 'document'` accetta `.pdf .docx .csv`.
   - `accept: 'document'` rifiuta `.png`.
   - `accept: 'any'` accetta qualsiasi URL valido (`.zip`, no estensione).
   - Branch **senza** `fileOptions` si comporta come `accept: 'any'` (URL `.exe` passa).
   - Asset-list con `accept: 'document'` rifiuta l'intero array se anche solo un item è `.png`.
   - Cache check: stesso seed con `fileOptions` diversi produce schemi compilati distinti (chiamare `validateAndSanitizeSeedPayload` due volte con `accept` `'image'` poi `'any'` e verificare comportamento differente).

**Accettazione:** `npm --workspace packages/core test` verde. Coverage ≥ regress baseline.

---

### Task 7 — Aggiornare `MediaDisplay` per render condizionale (`apps/dashboard`)
**Path:** `apps/dashboard/src/features/fields/display/media.tsx`

> Scope: questa è l'**unica** modifica UI di questo sprint. La UI di editing rimane attualmente "image-only" e viene riprogettata nel prossimo sprint.

Sostituire la logica di render con:

```typescript
import { FileIcon, ImageIcon } from "lucide-react"
import { resolveFileOptions } from "@beechcms/core"
// ...

export function MediaDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null || value === "") return <div className="text-muted-foreground">-</div>

  const { accept } = resolveFileOptions(branch)
  const renderAsImage = accept === 'image'

  if (isAssetListBranch(branch)) {
    const urls = parseAssetListValue(value)
    if (!urls.length) return <div className="text-muted-foreground">-</div>
    return (
      <div className="flex items-center gap-1">
        {urls.slice(0, 3).map((url, index) => (
          renderAsImage
            ? <Avatar key={`${url}-${index}`} className="...">
                <AvatarImage src={url} alt="" className="object-cover" />
                <AvatarFallback className="..."><FileIcon className="..." /></AvatarFallback>
              </Avatar>
            : <div key={`${url}-${index}`} className="flex size-10 items-center justify-center rounded-md border border-input bg-muted">
                <FileIcon className="size-5 text-muted-foreground" />
              </div>
        ))}
        {urls.length > 3 ? <span className="text-xs text-muted-foreground">+{urls.length - 3}</span> : null}
      </div>
    )
  }

  const url = parseSingleUrl(value)
  if (!url) return <div className="text-muted-foreground">-</div>

  if (!renderAsImage) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md border border-input bg-muted" title={url}>
        <FileIcon className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Avatar className="size-10 shrink-0 rounded-md border border-input bg-muted">
      <AvatarImage src={url} alt="" className="object-cover" />
      <AvatarFallback className="rounded-md bg-muted"><FileIcon className="size-5 text-muted-foreground" /></AvatarFallback>
    </Avatar>
  )
}
```

**Comportamento risultante:**
- `accept === 'image'`: identico ad oggi (anteprima immagine, fallback icona).
- `accept === 'document' | 'any'` o `fileOptions` mancante: **nessuna richiesta HTTP** verso l'URL, render diretto di `FileIcon`. Risolve flickering.

**Accettazione:**
- Aggiornare/aggiungere test in `apps/dashboard/src/test/fields/display-media.test.tsx`:
  - Branch senza `fileOptions` + URL `.pdf` → no `<img>` nel DOM, presente `FileIcon`.
  - Branch con `fileOptions.accept: 'image'` + URL `.png` → `<img>` presente.
  - Asset-list con `accept: 'any'` → 3 icone, nessun `<img>`.

---

### Task 8 — Aggiornare fixtures, templates e seed esistenti
**Path:**
- `apps/api/test/fixtures.ts` (L45): cambiare `{ alias: 'image', ..., type: 'file' }` → `{ ..., type: 'file', fileOptions: { accept: 'image' } }`.
- `bin/templates/blog.ts` (L12, L31), `bin/templates/empty.ts` (L36), `bin/templates/gallery.ts` (L11): per i campi semantici "image/cover/photo", aggiungere `fileOptions: { accept: 'image' }`. Lasciare invariati eventuali campi `type: 'file'` neutri.
- `apps/dashboard/src/test/fields/edit-media.test.tsx` (L11): aggiungere `fileOptions: { accept: 'image' }` al `mockBranch` per preservare comportamento previgente nei test.
- `apps/dashboard/src/test/fields/display-media.test.tsx`: stessa modifica al mock principale; **aggiungere** un secondo mock senza `fileOptions` per coprire il path "icona generica".

**Motivo:** retrocompatibilità comportamentale dei test. Il nuovo default `any` cambia semantica solo per chi non ha aggiornato il seed; questi file devono esplicitare l'intento storico.

**Accettazione:** `npm test` (root) verde.

---

### Task 9 — Traduzioni i18n (no UI editor in questo sprint)
**Path:** `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`, sezione `"media"`.

Aggiungere chiavi (placeholder, usate da Task 7 e dal prossimo sprint):
```json
"media": {
  "...esistenti": "...",
  "documentPreview": "Document",
  "filePreview": "File",
  "errorNotDocument": "Select a document (PDF, DOC, XLS, TXT, CSV)",
  "errorNotAccepted": "File type not accepted"
}
```

**Accettazione:** dashboard build OK, nessuna chiave mancante a runtime.

---

### Task 10 — Documentazione
**Path:**
- `docs/architecture.md`: in sezione "Branch types", aggiungere descrizione `fileOptions` + tabella `accept` ↔ MIME (rimando a §2 di questo doc).
- `docs/api-reference.md`: in sezione "Media Engine / Upload", documentare che `/upload` accetta unione `any` e che la validazione semantica avviene a salvataggio.
- `docs/guide.md`: aggiornare gli esempi di seed con `fileOptions`.

**Accettazione:** nessun link rotto, esempi coerenti con il codice attuale.

---

## 5. Out of scope (Sprint successivo — UI Overhaul)

Esplicitamente **non** in questo sprint:
1. Modifica di `MediaEdit` per accettare `application/pdf`, ecc. (oggi forza `image/*`).
2. Visualizzatori dedicati documenti (PDF viewer inline).
3. Enforcement client-side di `maxSize` per campo.
4. Drag&drop multi-MIME.
5. Bulk asset manager.
6. Migrazione retroattiva di seed in produzione (l'amministratore deve aggiungere `fileOptions: { accept: 'image' }` agli schemi che semanticamente trattano solo immagini).

---

## 6. Definition of Done dello sprint

- [ ] `npm run build` (root) verde.
- [ ] `npm test` (root) verde, incluso il nuovo `fileOptions` describe.
- [ ] `apps/dashboard` build OK, nessun warning i18n.
- [ ] Dashboard avviata localmente: un campo `file` senza `fileOptions` mostra icona, nessuna 404 in console di rete per URL non-immagine.
- [ ] Documentazione aggiornata e link interni validi.
- [ ] Branch di lavoro mergeato a `master` via PR con changelog (`apps/api/CHANGELOG` o `docs/Sprints/media/CHANGELOG.md`).
