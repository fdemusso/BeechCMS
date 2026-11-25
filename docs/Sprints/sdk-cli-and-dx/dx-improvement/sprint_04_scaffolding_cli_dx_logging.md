# Sprint 4 — Scaffolding, CLI DX & Custom Logging

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint is a pure DX layer. It does not introduce new API surface, new D1
tables, or new feature slices. It has two independent sub-goals:

1. **Scaffolding enrichment**: The generated `worker.ts` produced by
   `npm create beechcms@latest` currently exposes none of `BeechConfig.hooks`
   or `BeechConfig.customRoutes`. Developers have no in-project example of these
   APIs and must read external docs to discover them. Enriching the template with
   commented-out stubs is zero-risk and zero-coupling — it only touches
   `bin/create.mjs` (the scaffolder) and `docs/development.md`.

2. **TUI log surfacing**: `scripts/dev-cli/log-filters.ts` blanket-drops all
   2xx access-log lines emitted by Wrangler. This means calls to developer
   custom routes at `/api/custom/*` are silently swallowed in the API Logs tab.
   A one-line guard in the drop rule is sufficient to surface them.

VSA compliance: no code is added to `apps/api/src/features/` or
`apps/dashboard/src/features/`. Botanical invariant: no new D1 paths are
introduced. YAGNI: every change is the minimum viable delta to close the gap.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

### Factory & Config

- `apps/api/src/factory.ts:53–77` — `BeechConfig` already declares:
  ```ts
  hooks?: BeechHooks
  customRoutes?: (routers: { publicRouter: Hono<AppEnv>; protectedRouter: Hono<AppEnv> }) => void
  ```
- `apps/api/src/factory.ts:357–368` — custom routes are wired and mounted at:
  - `publicRouter`    → `/api/custom/public/<path>` (no auth)
  - `protectedRouter` → `/api/custom/<path>` (authMiddleware pre-applied)

### Hooks Interface

- `packages/core/src/hooks.ts:27–38` — `BeechHooks` exposes:
  ```ts
  beforeCreate?(data: Record<string, any>, ctx: HookContext): Promise<Record<string, any> | void> | …
  afterCreate?(entry: Record<string, any>, ctx: HookContext): Promise<void> | void
  // + beforeUpdate / beforeDelete / afterUpdate / afterDelete
  ```
  `HookContext.seed` is a full `Seed` object; the slug is `ctx.seed.slug`.
  The feature brief uses a non-existent `{ seedSlug }` destructure — that
  signature is wrong and must NOT be copied into the template.

### Scaffolder

- `bin/create.mjs:97–104` — `buildWorkerTs()` currently generates:
  ```ts
  export default createBeechApp({ seeds: Object.values(SEED_REGISTRY) })
  ```
  No hooks, no customRoutes, no instructional comments.
- `bin/templates/` — contains only seed content-type files
  (`blog.ts`, `gallery.ts`, `contact.ts`, `commerce.ts`, `tasks.ts`, `empty.ts`).
  No worker template exists.

### dev-cli TUI

- `scripts/dev-cli/log-filters.ts:33–37` — `access-log-2xx` DROP_RULE:
  ```ts
  {
    name: 'access-log-2xx',
    test: (line) => /^\[wrangler:info\]\s+(GET|POST|PUT|PATCH|DELETE)\s+.*\s2\d\d\b/.test(line),
  },
  ```
  Unconditionally drops every successful access log, including calls to
  `/api/custom/*`. Developer-defined route traffic is invisible in tab 2 (API Logs).

- `scripts/dev-cli/endpoints.ts:123–177` — static parser of `factory.ts`;
  cannot enumerate dynamically registered custom routes. No `/api/custom` entry
  in `FALLBACK_ENDPOINTS` either.

### Documentation

- `docs/development.md` — covers Docker stack and `beech` CLI commands; has no
  section on custom routes or lifecycle hooks (graphify node
  `docs_development_dev_cli_tui` at `docs/development.md:19` confirms scope).

### Middleware registration order (factory.ts, for reference — no changes)

1. `repositoryMiddleware` — injects repositories + hooks
2. `seedRegistryMiddleware` — hydrates seed registry from D1
3. `storageMiddleware` — R2 bucket
4. `authProvidersMiddleware`
5. `rateLimiterMiddleware`
6. `observabilityMiddleware`
7. CORS middleware
8. Security-headers middleware
9. Analytics middleware (`/api/*`)
10. Auth routes (`/auth/*`)
11. Setup + password reset
12. **Custom routes** (`/api/custom/public`, `/api/custom`) ← mounted before apiProtected
13. `apiProtected` sub-app (`/api`)
14. Dashboard SPA (`/admin/*`)

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Files **modified** (no new files created):

| File | Change |
|---|---|
| `bin/create.mjs` | Replace `buildWorkerTs()` body with enriched template |
| `scripts/dev-cli/log-filters.ts` | Guard `access-log-2xx` rule to pass `/api/custom` lines |
| `docs/development.md` | Add section "Creare API Custom e Utilizzare gli Hook di Ciclo di Vita" |

Zero changes to `apps/api/`, `apps/dashboard/`, `packages/core/`, or migrations.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

---

### Task A — `bin/create.mjs`: replace `buildWorkerTs()` (lines 97–104)

The inner template literal must escape `${...}` expressions with `\${...}` to
prevent JavaScript from interpolating them at scaffolder run-time.

```js
function buildWorkerTs() {
  return `/// <reference types="@cloudflare/workers-types" />
import { createBeechApp } from '@beechcms/api'
import { SEED_REGISTRY } from './seeds'

export default createBeechApp({
  seeds: Object.values(SEED_REGISTRY),

  // ── Lifecycle Hooks ──────────────────────────────────────────────────────────
  // Run before/after every content write. Uncomment to add validation,
  // notifications, or side-effects. Throwing inside a "before" hook aborts the
  // write; returning a modified object from beforeCreate/beforeUpdate overrides
  // the payload.
  //
  // hooks: {
  //   beforeCreate: async (data, ctx) => {
  //     console.log(\`[Hook] New record in \${ctx.seed.slug}\`, data)
  //     // if (ctx.seed.slug === 'posts' && !data.title) {
  //     //   throw new Error('Il titolo è obbligatorio per i post.')
  //     // }
  //   },
  //   afterCreate: async (entry, ctx) => {
  //     console.log(\`[Hook] Created in \${ctx.seed.slug}:\`, entry)
  //   },
  // },

  // ── Custom Routes ────────────────────────────────────────────────────────────
  // Register your own Hono routes alongside the Beech API.
  //   publicRouter    → /api/custom/public/<path>  (no auth required)
  //   protectedRouter → /api/custom/<path>          (Bearer token required)
  //
  // customRoutes: ({ publicRouter, protectedRouter }) => {
  //   publicRouter.get('/health', (c) => c.json({ status: 'ok', time: Date.now() }))
  //   protectedRouter.get('/me', (c) => c.json({ user: c.get('user') }))
  // },
})
`
}
```

---

### Task B — `scripts/dev-cli/log-filters.ts`: guard custom-route access logs

Replace the `access-log-2xx` object inside `DROP_RULES` (lines 33–37).

**Before:**
```ts
{
  name: 'access-log-2xx',
  test: (line) => /^\[wrangler:info\]\s+(GET|POST|PUT|PATCH|DELETE)\s+.*\s2\d\d\b/.test(line),
},
```

**After:**
```ts
{
  name: 'access-log-2xx',
  test: (line) => {
    if (!/^\[wrangler:info\]\s+(GET|POST|PUT|PATCH|DELETE)\s+.*\s2\d\d\b/.test(line)) return false
    // Surface custom-route traffic so developers can see their endpoints in action.
    if (/\/api\/custom/.test(line)) return false
    return true
  },
},
```

No other change to `log-filters.ts`.

---

### Task C — `docs/development.md`: new developer section

Insert the block below after the "Strumenti di Sviluppo Docker" table (around
line 60). Top-level `##` heading so it appears in the document outline.

````markdown
## Creare API Custom e Utilizzare gli Hook di Ciclo di Vita

### Custom Routes

Puoi registrare rotte Hono aggiuntive accanto all'API Beech tramite la chiave
`customRoutes` di `createBeechApp`. Sono disponibili due router pre-configurati:

| Router | Prefisso montato | Auth |
|---|---|---|
| `publicRouter` | `/api/custom/public/<path>` | Nessuna |
| `protectedRouter` | `/api/custom/<path>` | Bearer token (automatico) |

```ts
// worker.ts
export default createBeechApp({
  seeds: Object.values(SEED_REGISTRY),
  customRoutes: ({ publicRouter, protectedRouter }) => {
    publicRouter.get('/health', (c) => c.json({ status: 'ok' }))
    protectedRouter.get('/me', (c) => c.json({ user: c.get('user') }))
  },
})
```

Il **dev-cli TUI** (tab `2` — API Logs) mostra le chiamate a `/api/custom/*`
senza filtrarle; al contrario, il traffico 2xx verso le rotte Beech interne viene
soppresso per ridurre il rumore.

### Hook di Ciclo di Vita

Gli hook si agganciano alle operazioni di scrittura del Botanical Engine. Un hook
`before*` può modificare il payload (restituendo un oggetto modificato) o
annullare la scrittura (lanciando un errore). Gli hook `after*` vengono eseguiti
post-commit e non possono fare rollback su D1.

```ts
// worker.ts
export default createBeechApp({
  seeds: Object.values(SEED_REGISTRY),
  hooks: {
    beforeCreate: async (data, ctx) => {
      console.log(`[Hook] Nuovo record in ${ctx.seed.slug}`, data)
      if (ctx.seed.slug === 'posts' && !data.title) {
        throw new Error('Il titolo è obbligatorio per i post.')
      }
    },
    afterCreate: async (entry, ctx) => {
      console.log(`[Hook] Creato in ${ctx.seed.slug}:`, entry)
    },
  },
})
```

Il contesto (`ctx: HookContext`) espone:

| Proprietà | Tipo | Descrizione |
|---|---|---|
| `ctx.seed` | `Seed` | Definizione del contenuto; `ctx.seed.slug` per lo slug |
| `ctx.repository` | `ContentRepository` | Side-effect sui contenuti (rispetta il Botanical Engine) |
| `ctx.actor` | `HookActor \| undefined` | Utente JWT; `undefined` per operazioni di sistema |
| `ctx.db` | `unknown` | Escape hatch nativo — **evitare**: bypassa il Botanical Engine |
````

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Type-check (catches regressions in log-filters.ts)
pnpm run type-check

# 2. dev-cli unit tests — classifyLine is covered here
npx vitest run scripts/dev-cli

# 3. Smoke-test the scaffolder
node bin/create.mjs --yes scaffold-smoke-test
grep -q 'ctx.seed.slug'            scaffold-smoke-test/worker.ts && echo "PASS: hook example present"
grep -q 'publicRouter'             scaffold-smoke-test/worker.ts && echo "PASS: customRoutes example present"
grep -q 'protectedRouter'          scaffold-smoke-test/worker.ts && echo "PASS: protectedRouter present"
rm -rf scaffold-smoke-test

# 4. Full monorepo build
pnpm run build
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `buildWorkerTs()` output contains a commented `hooks` stub using
      `(data, ctx) =>` with `ctx.seed.slug` — no `seedSlug` positional argument.
- [ ] `buildWorkerTs()` output contains a commented `customRoutes` stub using
      `({ publicRouter, protectedRouter }) => void`.
- [ ] `node bin/create.mjs --yes smoke && rm -rf smoke` exits 0.
- [ ] `classifyLine('[wrangler:info] GET /api/custom/health 200')` returns
      `'pass'` (not `'drop'`).
- [ ] `classifyLine('[wrangler:info] GET /api/content/posts 200')` still returns
      `'drop'` (existing behaviour unchanged).
- [ ] All existing tests in `scripts/dev-cli/__tests__/` pass without
      modification.
- [ ] `docs/development.md` contains the section
      "Creare API Custom e Utilizzare gli Hook di Ciclo di Vita" with mount paths
      `/api/custom/public/` and `/api/custom/` correctly documented.
- [ ] `pnpm run build` exits 0.
- [ ] Zero new files inside `apps/api/src/features/` or
      `apps/dashboard/src/features/`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- No new TUI tab for custom routes.
- No update to `scripts/dev-cli/endpoints.ts` — custom routes are dynamically
  registered at runtime and cannot be statically enumerated from `worker.ts`.
- No changes to `apps/api/src/factory.ts` or `BeechConfig`.
- No changes to `packages/core/src/hooks.ts` or `BeechHooks`.
- No new `beech` CLI subcommand (e.g., `beech routes list`).
- No feature slice inside `apps/api/src/features/`.
- No WebSocket or runtime log streaming between the Worker and the TUI.
- No modification to `bin/templates/` content-type seed files.

HANDOFF -> caveman_coder
