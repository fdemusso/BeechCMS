# Runtime Seeds — Sprint 04: CLI — Code → DB Onboarding

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprints 01 + 02** (`seeds`/`seed_meta` tables exist; the worker no longer
> imports `seed.ts`). Read [`00-overview.md`](./00-overview.md).

## 0. Role & ground rules

Senior TypeScript engineer, Beech CMS monorepo. The CLI (`packages/cli`) is a **Node.js**
tool (not Workers) — it has a filesystem, runs `wrangler` via `spawnSync`, and executes
SQL through `executeD1File` / `queryD1` (see `packages/cli/src/lib/wrangler.ts`). Docs
English. Tests where practical (the CLI's existing tests are light; match that bar).

## 1. Why this sprint exists

After sprint 02 the worker hydrates seeds from the D1 `seeds` table and **no longer reads
`seed.ts`**. So `beech seed:load`'s old job — "generate `content_{slug}` tables from
`seed.ts`" — is now only half the story. The new job:

> **`beech seed:load` writes the `seed.ts` definitions INTO the `seeds` table AND applies
> their DDL.** This is the one-time bridge from code to DB. After it runs, the DB is the
> source of truth and `seed.ts` can be deleted.

This keeps a **code-first / AI-agent path**: an agent (or developer) authors content
types in `seed.ts`, runs the onboarding command non-interactively, and Beech is fully
provisioned — DB initialised, definitions loaded, tables created — without ever opening
the dashboard.

## 2. Current CLI surface (what you are changing)

- `packages/cli/src/commands/init.ts` — `beech init [--db] [--local]`. Checks files;
  with `--db` initialises the local D1 system tables from the embedded `BASE_SCHEMA_SQL`
  (sprint 01 added `seeds` + `seed_meta` there). Remote mode only *verifies*.
- `packages/cli/src/commands/seed-load.ts` — `beech seed:load [--local] [--diff] [--dry-run] [--db <name>]`.
  Today: reads `SEED_REGISTRY` (or an injected registry), validates, then for each seed
  (topologically ordered) builds `buildStatements(seed)` and `executeD1File`s them. It
  does **not** write any definition into a `seeds` table (that table didn't exist before
  this series).
- `packages/cli/src/commands/validate.ts` — `validateSeeds` (sprint 01 made it delegate
  to core's `validateSeedDefinitions`).
- `packages/cli/src/lib/wrangler.ts` — `executeD1File(sql, opts)`, `queryD1(sql, opts)`,
  `findWranglerConfig`, `resolveDbName`.

The registry is read from the user's project (`seed.ts` / `seeds.ts`). The CLI's `index.ts`
already resolves and passes it as `registry`.

## 3. What `seed:load` must now do

Extend `runLoad` in `seed-load.ts` so that, in addition to applying DDL, it **upserts each
seed definition into the `seeds` table** and **bumps `registry_version`**. The CLI writes
SQL via `executeD1File`, so generate the `INSERT … ON CONFLICT` statements as text.

For each topologically-ordered seed, the per-seed SQL block becomes:

```sql
-- (existing) content_{slug} DDL from buildStatements(seed)
CREATE TABLE IF NOT EXISTS content_{slug} ( … );
CREATE INDEX …;
-- … FTS, junctions, drafts …

-- (NEW) register the definition as the source of truth
INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
VALUES ('{slug}', '{json}', 'active', 'code', unixepoch(), unixepoch())
ON CONFLICT(slug) DO UPDATE SET
  definition = excluded.definition,
  status     = 'active',
  updated_at = excluded.updated_at;
```

`{json}` is `JSON.stringify(seed)` with single-quotes SQL-escaped (`'` → `''`). **Do not
hand-roll fragile escaping inline** — add a small `sqlQuote(value: string): string` helper
in `packages/cli/src/lib/wrangler.ts` (or a new `sql.ts`) that wraps the value in single
quotes and doubles internal quotes. Use it for the JSON literal.

> The `seeds` row sets `source='code'` — these came from `seed.ts`. Runtime-created seeds
> (sprint 03) use `source='runtime'`. The worker treats both identically; `source` is for
> the dashboard to optionally show a "defined in code" badge (sprint 05).

After all per-seed blocks, append **once**:

```sql
UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version';
```

so any running worker re-hydrates. (Local dev usually isn't running during load, but
remote `beech seed:load` against production must invalidate live isolates.)

Implementation shape (extend the existing `buildStatements` usage in `runLoad`):

```ts
function buildSeedRegistrationSql(seed: Seed): string {
  const json = sqlQuote(JSON.stringify(seed))
  return [
    `INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)`,
    `VALUES (${sqlQuote(seed.slug)}, ${json}, 'active', 'code', unixepoch(), unixepoch())`,
    `ON CONFLICT(slug) DO UPDATE SET definition = excluded.definition, status = 'active', updated_at = excluded.updated_at;`,
  ].join('\n')
}
```

Append `buildSeedRegistrationSql(seed)` to each seed's statement list, and add the single
`seed_meta` bump after the loop. `--dry-run` must print the new statements too. `--diff`
is unchanged (it diffs `content_{slug}` columns; optionally also report whether a `seeds`
row exists — nice-to-have, not required).

> **Pre-flight:** `seed:load` must ensure `seeds` + `seed_meta` exist. They are created by
> `beech init --db` (sprint 01). If a user runs `seed:load` against an uninitialised DB,
> the `INSERT INTO seeds` fails. Detect this: before loading, `queryD1` for the `seeds`
> table; if absent, print "Run `beech init --db` first" and exit non-zero. (Mirror the
> existing failure-guidance style in `runLoad`.)

## 4. Scriptable / non-interactive onboarding for agents

Today, full local provisioning is: `beech init --db --local` → `beech seed:load --local`
→ `wrangler dev`. The interactive bits in `init.ts` (the "create D1 + R2 automatically?"
prompt) block automation. Add a **non-interactive onboarding** path so an agent can run
one command and get a fully provisioned local Beech.

Add `beech onboard [--local] [--remote] [--yes]` (new command file
`packages/cli/src/commands/onboard.ts`, registered in `packages/cli/src/index.ts`). It
chains, with `--yes` implying every prompt's default and never reading stdin:

1. File check (reuse `checkFiles` logic / call `init` with appropriate args).
2. DB init: run the `init --db` flow. With `--yes`, skip the interactive D1/R2 creation
   prompt — if `wrangler.jsonc` still has a placeholder `database_id` and `--local`, just
   proceed (local D1 needs no real id); if `--remote` and placeholder, fail with a clear
   message (can't guess a remote DB).
3. `seed:load` (the new behaviour: tables + register definitions + bump version).
4. Print next steps (`wrangler dev`, open `/admin`, create admin via setup wizard).

> Keep `init` and `seed:load` independently usable. `onboard` is a thin orchestrator that
> calls their exported functions (`init(...)`, `seedLoad(...)`) with non-interactive args.
> Do **not** duplicate their logic.

Make the existing interactive prompts in `init.ts` honour a `yes`/non-interactive flag:
when set, take the default branch and never call `createInterface`/`rl.question`. Thread
a `nonInteractive: boolean` (or `yes: boolean`) option through `InitOptions`.

## 5. `seed.ts` is now optional / one-shot — update messaging

- `beech init`'s file check currently warns if `seeds.ts`/`seed.ts` is missing. Soften
  the copy: it is only needed for the **one-time** code → DB load; after `seed:load`, the
  DB is canonical and the file can be removed. Update the printed "Next steps" and the
  `seeds.ts` check message accordingly (English).
- Add a short note to the success output of `seed:load`: "Definitions registered in the
  database. `seed.ts` is no longer required at runtime — you may keep it for code-first
  edits or delete it."
- Update `docs/guide.md` §4, §5, §9, §10 and `README` references in a follow-up doc pass
  within this sprint (the doc rule: English). At minimum, change the "seeds.ts is the only
  file you write" framing and the schema-evolution section to reflect: runtime editing in
  the dashboard is now the primary path; `seed.ts` + `seed:load` is the code/AI path. Also
  update `docs/SYSTEM_MAP.md` where it says content tables are "generated at deploy time by
  `beech seed:load`" and where it describes seed loading — note the DB-resident runtime
  model and link to this sprint series.

## 6. The worker already ignores `seed.ts` (sprint 02) — verify

Confirm (do not re-do) that `apps/api/src/index.ts` no longer imports `seed.ts` and that
`apps/api/seed.ts` (the example project's seeds, if present) is no longer auto-loaded. The
CLI loads it explicitly; the worker reads only D1. If sprint 02 left a stale import, fix it
here and note the drift.

## 7. Tests

The CLI tests are light; match the existing bar:
- Unit-test `sqlQuote` (escapes `'`, wraps).
- Unit-test `buildSeedRegistrationSql` produces a valid `INSERT … ON CONFLICT` with the
  JSON escaped (no unescaped quotes).
- If there is an existing `seed-load` test harness that captures the generated SQL string
  (rather than hitting wrangler), assert the per-seed block now contains both the
  `content_{slug}` DDL and the `INSERT INTO seeds`, and that the batch ends with the
  `seed_meta` bump.
- `--dry-run` output includes the registration statements.

## 8. Acceptance criteria

- [ ] `beech seed:load [--local]` creates `content_{slug}` tables **and** upserts each
      definition into `seeds` (`source='code'`) **and** bumps `registry_version`.
- [ ] `seed:load` fails clearly if `seeds`/`seed_meta` don't exist, pointing to `beech init --db`.
- [ ] `beech onboard --local --yes` provisions a fresh local DB end-to-end with no stdin.
- [ ] `init`'s interactive prompts are skipped under the non-interactive flag.
- [ ] After `seed:load`, a running worker serves the loaded seeds (DB is source of truth);
      deleting `seed.ts` does not affect the running CMS.
- [ ] `docs/guide.md`, `docs/SYSTEM_MAP.md` updated to the runtime-seed model (English).
- [ ] Build + CLI tests pass.

## 9. Do NOT

- Do not reintroduce a worker-side `seed.ts` import.
- Do not emit destructive SQL (DROP/RENAME) — `seed:load` stays additive (it already is).
- Do not make `onboard` interactive when `--yes` is passed.
- Do not change the runtime registry hydration (sprint 02 owns it).
