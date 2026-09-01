### Summary
The `seed:load` command and schema bootstrap currently compile Seeds (creating `content_*` tables, indexes, FTS5 virtual tables, triggers, and `seed_layouts`) only against the local SQLite database in `.wrangler/state/v3/d1`.

When users deploy their project to Cloudflare (`wrangler deploy`), the remote Cloudflare D1 database does not contain the generated content tables or seeds registry, resulting in runtime errors (`no such table: content_*`).

### Proposed Solution
Add official support for `--remote` in `@beechcms/cms` CLI (e.g. `npx beech seed:load --remote` or `npx @beechcms/cms sync --remote`) that compiles the TypeScript seeds and applies the resulting DDL directly to the remote Cloudflare D1 database via `wrangler d1 execute DB --remote`.