# SECTION 6 — ACCEPTANCE CRITERIA

- [x] `UNSUPPORTED_BRANCH_TYPES` in `@beechcms/core` non contiene più `'json'`.
- [x] `FULL_WIDTH_BRANCH_TYPES` in `@beechcms/core` contiene `'json'`.
- [x] `isLayoutableBranch` restituisce `true` per qualsiasi branch di tipo `json` (esclusi gli alias di sistema o policy hidden).
- [x] `generateDefaultLayout` genera una sezione dedicata a 1 colonna a tutta larghezza per ciascun campo `json` presente nel Seed.
- [x] `validateLayoutAgainstSeed` valida con successo un layout con campo `json` in sezione a 1 colonna dedicata.
- [x] `validateLayoutAgainstSeed` fallisce con messaggio di errore esplicito se un campo `json` risiede in una sezione con più di una colonna o è affiancato ad altri campi.
- [x] `useLayoutBuilder` impedisce via `assignField` e `moveField` l'inserimento di campi `json` in sezioni multi-colonna o l'affiancamento con altri campi.
- [x] `useLayoutBuilder` impedisce via `setSectionColumnCount` l'aumento delle colonne a più di 1 per sezioni contenenti campi `json`.
- [x] `prepareSubmissionPayload` normalizza valori `""`, `"   "`, `null`, `undefined` associati a campi `json` in `{}` nel payload serializzato.
- [x] `validateEntryJsonFields` intercetta stringhe JSON malformate restituendo `{ isValid: false, errorFieldLabel: ... }` e blocca il submit nel form delle entry.
- [x] Zero dipendenze aggiunte ad `@beechcms/core` o `apps/api`.
- [x] Tutti i test unitari di `@beechcms/core` e `apps/dashboard` passano con successo (`pnpm test`).

# SECTION 5 — VALIDATION OUTPUT

## 1. Core Build
```
$ pnpm --filter @beechcms/core run build
$ tsc -p tsconfig.build.json
```
Exit code: 0

## 2. Core Unit Tests
```
$ pnpm --filter @beechcms/core test
 Test Files  32 passed (32)
      Tests  616 passed (616)
```
Exit code: 0

## 3. API Build
```
$ pnpm --filter @beechcms/api build
$ esbuild src/factory.ts --bundle --packages=external --platform=neutral --format=esm --outfile=dist/index.js && tsc -p tsconfig.build.json
  dist/index.js  410.2kb
⚡ Done in 23ms
```
Exit code: 0

## 4. Dashboard Typecheck
```
$ pnpm --filter @beechcms/dashboard run type-check
$ tsc -b
```
Exit code: 0

## 5. Dashboard Unit Tests
```
$ pnpm --filter @beechcms/dashboard test
 Test Files  104 passed (104)
      Tests  787 passed (787)
```
Exit code: 0

## 6. Graph Sync
```
$ graphify update .
Re-extracting code files in . (no LLM needed)...
Rebuilt: 10781 nodes, 19205 edges, 882 communities
graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
```
Exit code: 0
