# Developer CLI Workflows

The `beech` CLI provides unified workflows for scaffolding projects, running local emulation, managing database migrations, generating types and forms, and deploying to Cloudflare Workers.

---

## Scope Separation: Consumer vs Contributor

Commands are categorized by operational scope:

- **Consumer Projects**: Scaffolded via `npx @beechcms/cms`. Workspaces contain `worker.ts`, `wrangler.jsonc`, and `.dev.vars`. Run via `npx beech <cmd>` or `npm run <script>`.
- **Monorepo Contributors**: Engineers contributing directly to the core BeechCMS engine (`apps/api`, `apps/dashboard`, `packages/*`). Utilizes Docker Compose, Turborepo, Vitest, and interactive terminal TUI.

---

## Comprehensive Command Matrix

| Command | Scope | Description | Options & Aliases |
| :--- | :--- | :--- | :--- |
| `npx @beechcms/cms` | Consumer | Interactive scaffolding wizard for new edge projects. | `--yes` (non-interactive starter) |
| `npx beech init` | Consumer | Verifies project config (`worker.ts`, `wrangler.jsonc`). | `--db` (applies tables), `--remote`, `--db-name <n>`, `--yes` |
| `npx beech onboard` | Consumer | One-step project verification and D1 readiness check. | `--remote`, `--db <name>`, `--yes` |
| `npx beech db:migrate` | Consumer | Applies local D1 database migrations. | Runs `npm run db:migrate:local` or `beech init --db` |
| `npx beech db:reset` | Consumer | Clears local Wrangler state and re-bootstraps fresh database. | Runs `npm run db:reset:local` or purges `.wrangler/state` |
| `npx beech reset` | Monorepo | Comprehensive environment reset. | `--db`, `--docker`, `--all`, `--yes` |
| `npx beech types generate` (`beech types:generate`) | Consumer | Generates `beech.generated.ts` (`SeedRegistryTypes` + `SCHEMA_FINGERPRINT`) from live D1. | `--remote`, `-o`/`--output <file>`, `--db <name>` (aliases: `beech gen types typescript`, `beech gen-types`, `beech gen:types`, `beech generate:types` — these print to stdout by default) |
| `npx beech schema export` (`beech schema:export`) | Consumer | Writes `beech.schema.ts` — a reviewable snapshot of the live D1 schema. | `--out <file>`, `--stdout`, `--remote`, `--db <name>` |
| `npx beech forms` | Consumer | Interactive wizard generating React, Vue, Svelte, or Web Component forms. | `--seed <slug>`, `--framework <name>`, `--mode <create\|edit>`, `--out <path>`, `--yes`, `--json` (aliases: `form`, `forms:add`) |
| `npx beech setup:cloudflare` | Consumer | 1-step Cloudflare edge provisioning (D1, R2, S3 secrets). | `--name <name>`, `--yes` (alias: `setup:cf`) |
| `npx beech deploy` | Consumer | Deploys Worker and embedded admin dashboard to Cloudflare. | `--skip-check`, `--skip-seed` |
| `npx beech build` | Consumer | Informational check confirming BeechCMS requires no static build step. | None |
| `npx beech update` | Consumer | Upgrades core engine packages and applies system migrations. | None |
| `npx beech doctor` | Consumer | Runs health checks and React diagnostics on the Dashboard. | None |
| `npx beech validate` | Consumer | Confirms active runtime schema validation on `/api/seeds`. | None |
| `npx beech dev` | Monorepo | Starts local contributor environment (Docker + API + Dashboard). | `--plain` (headless non-TUI), alias `start` |
| `npx beech dev:stop` | Monorepo | Gracefully stops local monorepo Docker containers. | None |
| `npx beech dev:reset` | Monorepo | Stops local Docker containers and purges volumes (`docker compose down -v`). | None |
| `npx beech dev:tunnel` | Monorepo | Displays active Cloudflare quick tunnel public URL from container logs. | None |
| `npx beech mailpit:clear` | Monorepo | Clears local Mailpit development inbox. | None |
| `npx beech logs <service>` | Monorepo | Streams logs from Docker services. | Services: `mailpit`, `sqlite` (`db`), `tunnel`, `minio` (`storage`) |
| `npx beech schema diff` (`beech schema:diff`) | Consumer | Reports manifest-vs-deployed drift and definition-vs-physical-table drift. Exits 1 on drift. | `--manifest <file>`, `--remote`, `--db <name>` |
| `npx beech seed:load` | **Deprecated** | Prints a deprecation notice and exits. Static `seeds.ts` files are no longer synchronized to the database. | Flags accepted but ignored |
| `npx beech seed:create` | **Deprecated** | Prints a deprecation notice and exits. Create content types in the dashboard (`/admin`) or via `POST /api/seeds`. | Flags accepted but ignored |
| `npx beech test` | Monorepo | Executes Turborepo test runner. | `--coverage`, `--diff`, `--tier <unit\|flow\|integration\|e2e>` |
| `npx beech lint` | Monorepo | Executes project linter checks via Turborepo. | None |

---

## Core Developer Workflows

### 1. Scaffolding & Initialization

Scaffold an edge project interactively or with non-interactive flags:

```bash
# Interactive wizard
npx @beechcms/cms my-app

# Non-interactive quickstart
npx @beechcms/cms my-app --yes
cd my-app
npm install
```

Verify your project setup and apply initial system tables:

```bash
npx beech onboard
```

### 2. Database Migrations

Apply migrations after pulling updates or creating seeds:

```bash
# Apply local D1 migrations
npx beech db:migrate

# Reset database to clean state
npx beech db:reset
```

### 3. TypeScript Type Generation

BeechCMS generates typed TypeScript interfaces directly from your live Seed schemas stored in D1.
`npx beech types generate` writes `beech.generated.ts`, containing `SeedRegistryTypes` **and** a
`SCHEMA_FINGERPRINT` constant — the value a future `@beechcms/client` compares against the API's
`X-Schema-Revision` response header to detect a stale build:

```bash
# Generate types + fingerprint for all seeds to beech.generated.ts
npx beech types generate

# Generate types from remote production database, to a custom path
npx beech types generate --remote -o src/types/beech.ts
```

The historical aliases (`gen-types`, `gen:types`, `generate:types`, `gen types typescript`) still
work and keep printing to stdout by default, so no existing script changes behaviour.

### 4. Interactive Form Generation

Generate ready-to-use frontend forms mapped to your content models:

```bash
npx beech forms --seed posts --framework react --out src/components/PostForm.tsx
```

### 5. Cloudflare Provisioning & Deployment

```bash
# 1. Provision D1, R2, and master secrets
npx beech setup:cloudflare

# 2. Deploy Worker and embedded dashboard
npx beech deploy
```

### 6. Schema Evolution & GitOps Migrations

> [!IMPORTANT]
> `beech schema export` and `beech schema diff` read live D1 through `@beechcms/core`'s introspection primitive; D1 remains the sole runtime authority, the Worker never imports `beech.schema.ts`, and no deploy applies it. `beech seed:load` / `beech seed:create` stay deprecated. **Applying** a manifest (`beech schema plan` / `apply`) is not shipped yet — manifest reconciliation today goes through the [MCP plan/apply tools](/reference/mcp-server).

The versioned SQL files in `apps/api/migrations/` cover the **system** schema (`seeds`, `users`, `sessions`, `api_keys`, `media`, OAuth clients), not per-Seed content tables. Apply them with Wrangler.

#### Automated GitOps in GitHub Actions

Apply versioned D1 system migrations in CI/CD before deploying the Worker:

```yaml
name: Deploy (D1 migrations + Worker)
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # Apply versioned migrations BEFORE deploying the Worker
      - name: Apply D1 migrations
        run: pnpm --filter @beechcms/api exec wrangler d1 migrations apply beech-db --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Deploy Worker
        run: pnpm --filter @beechcms/api exec wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## Monorepo Contributor Infrastructure

For developers working directly on the BeechCMS monorepo, `npx beech dev` orchestrates local Docker services:

### Docker Infrastructure Services

| Service | Container | Ports | Purpose |
| :--- | :--- | :--- | :--- |
| **MinIO** | `beech-minio` | `9000` (S3 API), `9001` (Console) | Local Cloudflare R2 emulation with presigned URL support. |
| **Mailpit** | `beech-mailpit` | `1025` (SMTP), `8025` (Web UI/API) | Zero-config local email delivery and verification. |
| **SQLite Web** | `beech-sqlite-web`| `8080` (Web UI) | Visual database browser for local D1 SQLite state. |
| **Webhook Tester**| `beech-webhook-tester` | `8084` (HTTP API) | Local endpoint for testing notification webhooks. |
| **Cloudflare Tunnel**| `beech-tunnel` | Public URL (`*.trycloudflare.com`)| Public HTTPS URL forwarding to local Worker for webhooks. |

### Interactive TUI Dashboard

When executing `npx beech dev`, an interactive Ink terminal interface is launched:

- Press `1`: **Status** overview of all background services.
- Press `2`: **API Logs** from the Hono Worker.
- Press `3`: **Dashboard Logs** from the Vite React app.
- Press `4`: **Core Logs** from the `@beechcms/core` watch build.
- Press `5`: **System Logs** from the Docker infrastructure services.
- Press `6`: **Endpoints** quick reference list with local URLs.
- Press `7`: **Versions** of all monorepo packages.
- Press `Tab` / `Shift+Tab` (or `←` / `→`): Cycle between tabs.
- Press `r`: Restart the API and Dashboard dev servers.
- Press `d` / `x`: Expand or dismiss the currently selected error in the error bar.
- Press `q` (or `Ctrl+C`): Gracefully terminate all services.
- Flag `--plain`: Launches services without TUI formatting for CI/CD environments.
