# BeechCMS Development Commands

Beech requires Docker. There's no "lightweight" mode; those who can't or don't want to have Docker can't develop on Beech.

All commands are unified under the `pnpm beech` CLI.

## Unified CLI Commands (`pnpm beech`)
- `pnpm beech dev`             : Starts development environment (Docker stack + API + Dashboard)
- `pnpm beech dev:stop`        : Stops Docker containers (retains data)
- `pnpm beech dev:reset`       : Stops Docker containers and removes all persistent volumes
- `pnpm beech dev:tunnel`      : Prints Cloudflare Quick Tunnel URL
- `pnpm beech mailpit:clear`   : Clears Mailpit inbox
- `pnpm beech logs <service>`   : Streams logs for docker services: `mailpit`, `db`, `tunnel`, `storage`
- `pnpm beech onboard --yes`    : Fully automated local provisioning (init --db)
- `pnpm beech init --db`        : Initialises database locally
- `pnpm beech db:migrate`      : Applies D1 schema migrations locally
- `pnpm beech db:reset`        : Removes Wrangler local state and boots DB from scratch
- `pnpm beech gen-types`       : Generates TypeScript interfaces from active D1 database
- `pnpm beech validate`        : Validates runtime schema status
- `pnpm beech seed:create`     : (Deprecated) Content types are created via dashboard or /api/seeds
- `pnpm beech seed:load`       : (Deprecated) Schemas are stored canonically in D1
- `pnpm beech schema:diff`     : (Deprecated) Schema mutations are handled by the Botanical Engine
- `pnpm beech test`            : Runs workspace tests (accepts `--diff` or `--coverage`)
- `pnpm beech lint`            : Runs lint checks across the monorepo
- `pnpm beech deploy`          : Compiles and deploys Worker and assets to Cloudflare production
- `pnpm beech doctor`          : Executes dashboard diagnostics checks
