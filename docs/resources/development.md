---
title: Development Setup
group: Developer Guide (Internals)
category: Setup
---

# Development Setup

> [!TIP]
> **New Documentation Structure**:
> Looking for developer tooling and architectural patterns? See **[CLI Workflows](/build/cli-workflows)** and **[Vertical Slice Architecture](/build/vertical-slice-architecture)** in the Build section.

This guide is for **core engine contributors and developers** working directly on the BeechCMS monorepo source code (`apps/api`, `apps/dashboard`, `packages/core`, and `packages/widget-sdk`).

If you are building a website or using BeechCMS as a consumer, refer to the **[Getting Started Overview](/start/)** or **[First Project Tutorial](/start/first-project)** instead.

## Prerequisites

- **Node.js**: `v20.0.0` or higher (Node 22 LTS recommended)
- **pnpm**: `v9.0.0` or higher
- **Docker Desktop** or **Docker Engine**: Required for the local development services (MinIO, Mailpit, SQLite Web, webhook-tester, and cloudflared tunnel).

> [!IMPORTANT]
> **Docker is Required for Core Development**: Developing directly on the monorepo requires the local Docker infrastructure to simulate Cloudflare R2, transactional SMTP, and webhook testing.

## Local Monorepo Stack

Start the entire local development environment with a single command:

```bash
pnpm run dev:full
```

This single command:
1. Spawns the Docker infrastructure stack (MinIO, Mailpit, SQLite Web, webhook-tester, tunnel).
2. Bootstraps the local D1 SQLite database and applies system migrations automatically.
3. Launches the Cloudflare Workers API server and React Dashboard SPA concurrently with live reload.
4. Opens an interactive full-screen Terminal UI (TUI).

### Interactive TUI

When running in an interactive terminal (TTY), `pnpm run dev:full` displays an Ink-powered dashboard:

- **Status (`1`)**: Live status of all Docker containers, tunnel URLs, and microservices.
- **API Logs (`2`) & Dashboard Logs (`3`)**: Filtered live logs with auto-scroll and pause (`⏸`).
- **Endpoints (`4`)**: Real-time list of exposed API routes grouped by feature slice.
- **Versions (`5`)**: Monorepo package versions and runtime diagnostics.
- **Error Bar**: Interactive top bar highlighting recent errors. Press `d` to expand stack traces or `x` to dismiss.
- **Keybindings**: `1`–`5` switch tabs, `Tab` cycles views, `↑`/`↓` scrolls logs, `q` or `Ctrl+C` performs a clean shutdown.

> [!TIP]
> For CI environments or headless scripts, run `pnpm run dev:plain` (or set `BEECH_DEV_PLAIN=1`) for standard linear console output.

### Docker Infrastructure Services

| Service | Host Port | Web Console / URL | Purpose |
| :--- | :--- | :--- | :--- |
| **MinIO (S3)** | `9000` / `9001` | [http://localhost:9001](http://localhost:9001) (`beechdev` / `beechdevsecret`) | Simulates Cloudflare R2 storage with presigned URLs |
| **Mailpit** | `1025` (SMTP) / `8025` (HTTP) | [http://localhost:8025](http://localhost:8025) | Local inbox for password resets and automation emails |
| **SQLite Web** | `8080` | [http://localhost:8080](http://localhost:8080) | Read-only web inspector for the local D1 database |
| **Webhook Tester** | `8084` | [http://localhost:8084](http://localhost:8084) | Local sink for testing outbound automation webhooks |
| **Cloudflared Tunnel** | — | Dynamic `*.trycloudflare.com` URL | Exposes the local API to receive incoming webhooks (e.g. QStash) |

## Developer CLI Commands

| Command | Action |
| :--- | :--- |
| `pnpm run dev:full` | Starts the full Docker stack + API + Dashboard with TUI (canonical command) |
| `pnpm run dev:plain` | Starts the stack with plain non-interactive logging |
| `pnpm run dev:tunnel-url` | Prints the active public Cloudflare tunnel URL |
| `pnpm run dev:mailpit:reset` | Flushes all messages from the local Mailpit inbox |
| `pnpm run dev:logs:minio` | Streams live logs from the MinIO container |
| `pnpm run dev:logs:sqlite` | Streams live logs from SQLite Web |
| `pnpm run dev:stop` | Stops all containers while preserving data volumes |
| `pnpm run dev:reset` | Tears down all containers and resets all volumes |
| `pnpm run build` | Builds all packages across the Turborepo monorepo |
| `pnpm run lint` | Runs ESLint and formatting checks across all packages |
| `pnpm run type-check` | Runs TypeScript compiler checks across all workspaces |
| `pnpm test` | Runs the test runner suite against local integration containers |

## Environment Configuration

Initialize your local environment variables:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Default values for local services are pre-configured:

| Variable | Default (Local Dev) | Description |
| :--- | :--- | :--- |
| `R2_ENDPOINT` | `http://localhost:9000` | S3 endpoint for local MinIO |
| `R2_ACCESS_KEY_ID` | `beechdev` | MinIO access key |
| `R2_SECRET_ACCESS_KEY` | `beechdevsecret` | MinIO secret key |
| `R2_BUCKET_NAME` | `beech-media` | Media storage bucket name |
| `EMAIL_PROVIDER` | `smtp` | Set to `smtp` for Mailpit, `resend` for production |
| `SMTP_HOST` | `localhost` | Mailpit host |
| `SMTP_PORT` | `8025` | Mailpit HTTP API port |
| `EMAIL_FROM` | `Beech CMS <dev@beech.local>` | Default email sender |
| `WEBHOOK_TESTER_URL` | `http://localhost:8084` | Local webhook sink |

## Database Bootstrap & Migrations

When running `pnpm run dev:full`, the bootstrap script (`apps/api/scripts/bootstrap-d1.mjs`) automatically executes all D1 SQL migrations if the local database is uninitialized.

To manually reset and re-apply local database migrations:

```bash
cd apps/api && pnpm run db:reset:local
cd ../..
pnpm run dev:full
```

To execute arbitrary SQL against your local D1 SQLite database:

```bash
npx wrangler d1 execute DB --local --command "SELECT * FROM seeds;"
```

## Working with Runtime Seeds

In BeechCMS, content models (Seeds) are database-resident. The Cloudflare D1 `seeds` table serves as the canonical runtime source of truth.

### Local Provisioning & Onboarding

To provision your local database system tables:

```bash
npx beech onboard --local --yes
```

### Dynamic Content Models during Development

Content types are created and managed dynamically at runtime via the BeechCMS Dashboard (`http://localhost:8789/admin`) or through the `/api/seeds` endpoints. The Botanical Engine handles schema changes, generates table structures, and updates the cached registry version (`seed_meta.registry_version`) so running API instances update immediately without restarts.

## Testing Strategy

BeechCMS integration tests run against **real local containers** (MinIO, Mailpit, webhook-tester) rather than mocked network calls.

```bash
# 1. Start the stack in one terminal
pnpm run dev:full

# 2. Run the Vitest test suite in another terminal
pnpm test
```

### Test Architecture

| Layer | Testing Approach |
| :--- | :--- |
| **Pure Logic & Validators** | Isolated Vitest unit tests (fast, zero external dependencies) |
| **Database Operations** | `D1TestDatabase` (`better-sqlite3` in-memory with FTS5 support) |
| **Transactional Email** | Integration tests against Mailpit SMTP container |
| **Media & File Storage** | Integration tests against MinIO with ephemeral test buckets (`beech-media-test-<pid>`) |
| **Webhooks & Automations** | Integration tests against the local webhook-tester sink |
