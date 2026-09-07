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
| `npx beech gen types typescript` | Consumer | Generates typed TypeScript interfaces from active D1 Seeds. | `--local` (default), `--remote`, `-o`/`--out`/`--output <file>`, `--db <name>` (aliases: `gen-types`, `gen:types`, `generate:types`) |
| `npx beech forms` | Consumer | Interactive wizard generating React, Vue, Svelte, or Web Component forms. | `--seed <slug>`, `--framework <name>`, `--mode <create\|edit>`, `--out <path>`, `--yes`, `--json` (aliases: `form`, `forms:add`) |
| `npx beech setup:cloudflare` | Consumer | 1-step Cloudflare edge provisioning (D1, R2, S3 secrets). | `--name <name>`, `--yes` (alias: `setup:cf`) |
| `npx beech deploy` | Consumer | Deploys Worker and embedded admin dashboard to Cloudflare. | `--skip-check` |
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
| `npx beech schema:diff` | Consumer | Computes schema drift against Seed blueprints; `--write` generates migration. | `--write`, `--remote`, `--db <name>` |
| `npx beech seed:load` | Consumer | Synchronizes Seed blueprints into active D1 runtime tables. | `--diff`, `--remote`, `--db <name>` |
| `npx beech seed:create` | Consumer | Interactive CLI wizard to scaffold a new Seed blueprint. | None |
| `npx beech test` | Monorepo | Executes Turborepo test runner. | `--coverage`, `--diff` |
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

BeechCMS generates typed TypeScript interfaces directly from your live Seed schemas stored in D1:

```bash
# Generate types for all seeds to src/types/beech.ts
npx beech gen types typescript -o src/types/beech.ts

# Generate types from remote production database
npx beech gen types typescript --remote -o src/types/beech.ts
```

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

### 6. Schema Sync & GitOps Migrations

Detect schema drift between your TypeScript Seed blueprints and the physical D1 database, then generate versioned SQL migrations:

```bash
# Preview additive SQL changes without writing
npx beech schema:diff

# Write next migration file (e.g. apps/api/migrations/0034_add_status.sql)
npx beech schema:diff --write

# Target remote production D1
npx beech schema:diff --remote
```

#### Automated GitOps in GitHub Actions

Apply versioned D1 migrations in CI/CD before deploying the Worker:

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
| **Webhook Tester**| `beech-webhook` | `8084` (HTTP API) | Local endpoint for testing notification webhooks. |
| **Cloudflare Tunnel**| `beech-tunnel` | Public URL (`*.trycloudflare.com`)| Public HTTPS URL forwarding to local Worker for webhooks. |

### Interactive TUI Dashboard

When executing `npx beech dev`, an interactive Ink terminal interface is launched:

- Press `1`: **Status** overview of all background services.
- Press `2`: **API Logs** from the Hono Worker.
- Press `3`: **Dashboard Logs** from the Vite React app.
- Press `4`: **Endpoints** quick reference list with local URLs.
- Press `5`: **Versions** of all monorepo packages.
- Press `q`: Gracefully terminate all services.
- Flag `--plain`: Launches services without TUI formatting for CI/CD environments.
