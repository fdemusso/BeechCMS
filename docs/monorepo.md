# Architettura Monorepo Beech CMS

Documentazione della struttura del progetto: Turborepo con npm workspaces.

---

## 1. Struttura

```
beech-cms/
├── apps/
│   ├── api/           # API REST (Hono + Cloudflare Workers/D1)
│   └── dashboard/     # Frontend React (Vite)
├── packages/
│   └── core/          # @beech/core - Botanical Engine condiviso
├── docs/              # Documentazione
├── package.json       # Root: workspaces, scripts turbo
├── tsconfig.json      # Config TypeScript base (ereditata dai pacchetti)
└── turbo.json         # Pipeline Turbo (dev, build, test)
```

---

## 2. Pacchetti

### @beech/core (`packages/core`)

Pacchetto condiviso che contiene la logica del **Botanical Engine**:

- **Tipi**: `Branch`, `Seed`, `DbPayload`, `ApiPayload`
- **Translation Layer**: `apiToDb`, `dbToApi` (alias ↔ ID interni)
- **Seed Registry**: `SEED_REGISTRY`, `getSeed`, `PROJECT_SEED`
- **Validation Foundation**: `validateAndSanitizeSeedPayload`, `isValidContentStatus`

**Uso:** Import da API e Dashboard con `import { getSeed, apiToDb, dbToApi } from '@beech/core'`.

**Build:** `npm run build -w @beech/core` genera `dist/` con JS e `.d.ts`. Le app consumano l'output compilato.

**Dev watch:** `npm run dev -w @beech/core` avvia `tsc -w` e ricompila automaticamente `dist/` quando cambiano i file in `src/`.

Vedi [Botanical Engine](botanical-engine.md) per i dettagli.

### apps/api

API REST su Cloudflare Workers. Dipende da `@beech/core` per il Content Engine.

- Rotte interne dashboard: `/api/content/*` (JWT).
- Rotte pubbliche: `/api/v1/public/*` (API key).

### apps/dashboard

Frontend React. Dipende da `@beech/core` per tipi e logica condivisa (es. validazione, form dinamici futuri).

---

## 3. TypeScript

- **Root** `tsconfig.json`: configurazione base (`strict`, `moduleResolution: Bundler`, ecc.)
- **packages/core**: estende la root, abilita `composite`, `declaration`, `declarationMap`, output in `dist/`
- **apps**: possono estendere la root o avere config specifiche (es. Cloudflare types, Vite)

---

## 4. Script e Turbo

| Comando | Descrizione |
|---------|-------------|
| `npm run dev` | Avvia dev in parallelo (api + dashboard + watcher di `@beech/core`) |
| `npm run test` | Esegue i test di tutti i pacchetti |
| `npm run build -w @beech/core` | Build del pacchetto core |
| `npm run build` | Build di tutti i pacchetti (Turbo ordina per dipendenze) |

Turbo compila `@beech/core` prima delle app che lo dipendono.

In sviluppo locale, se modifichi file condivisi (es. `packages/core/src/seeds.ts`), il watcher di `@beech/core` mantiene `dist/` aggiornato e le app vedono i cambi in modo automatico senza build manuale.

---

## 5. Dipendenze workspace

In `apps/api/package.json` e `apps/dashboard/package.json`:

```json
"dependencies": {
  "@beech/core": "*",
  ...
}
```

`*` o `^0.0.0` risolve al workspace locale. Dopo `npm install` dalla root, i link sono attivi.
