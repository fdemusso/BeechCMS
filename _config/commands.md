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
- `pnpm beech onboard --yes`    : Fully automated local provisioning (init --db + seed:load)
- `pnpm beech init --db`        : Initialises database locally
- `pnpm beech db:migrate`      : Applies D1 schema migrations locally
- `pnpm beech db:reset`        : Removes Wrangler local state and boots DB from scratch
- `pnpm beech seed:create`     : Interactive wizard to generate new Seed schemas
- `pnpm beech seed:load`       : Synchronises seed definitions to the database
- `pnpm beech schema:diff`     : Compares SEED_REGISTRY and D1 to generate additive migrations
- `pnpm beech validate`        : Validates seeds.ts for errors
- `pnpm beech generate:types`  : Generates TypeScript interfaces from seeds
- `pnpm beech test`            : Runs workspace tests (accepts `--diff` or `--coverage`)
- `pnpm beech lint`            : Runs lint checks across the monorepo
- `pnpm beech deploy`          : Compiles, tests, and deploys to Cloudflare production
- `pnpm beech doctor`          : Executes dashboard diagnostics checks
