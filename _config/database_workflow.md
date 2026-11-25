# Database & Migration Workflow (D1)

All D1 schema changes require a numbered SQL file AND a corresponding entry in `wrangler.jsonc`.

## Step 1 — Create the SQL file
Add a new file in `apps/api/migrations/` following the naming convention:
`apps/api/migrations/XXXX_<short_description>.sql` (e.g. `0017_add_published_at.sql`).

## Step 2 — Register in wrangler.jsonc
Add your new migration file to the `migrations` array in the `[[d1_databases]]` section of `apps/api/wrangler.jsonc`. Do not skip or reorder entries.

## Step 3 — Apply locally
- `pnpm run db:migrate:local` : applies every migration not yet recorded in the local `d1_migrations` table (the table wrangler uses), one transaction per file, and prints each file it applies. A fully migrated DB is a no-op. A failing migration aborts with exit 1 and is not recorded.
- A local DB created before migration tracking existed (schema present, no `d1_migrations`) is refused with exit 1, because there is no way to tell which files already ran. Wipe it with `pnpm beech db:reset`.
- `pnpm run db:reset:local` : wipes .wrangler state and re-runs all migrations.

## Step 4 — Deploy to production
- `pnpm run deploy` : wrangler deploy --minify. Wrangler auto-applies unapplied migrations.

## Migration Rules
- **Never edit** an already-applied migration file. Create a new one instead.
- **Never skip** a sequence number.
- Each Seed has its own `content_{slug}` table.
- System tables: `users`, `sessions`, `password_reset_tokens`, `media_objects`, `activity_logs`, `notifications`, `public_idempotency_keys`, `analytics`.
- FTS5 tables (`fts_{slug}`) and triggers are managed by the Botanical Engine.
