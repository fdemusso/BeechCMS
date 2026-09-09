---
name: beechcms-mcp
description: BeechCMS MCP Agent Skill — inspect and evolve BeechCMS content schemas safely through the Botanical Engine.
---

# BeechCMS MCP Agent Skill

A BeechCMS MCP server is available over Stdio. D1 is the only runtime authority for schema:
there are no `seeds.ts` files to edit, and raw SQL is never an option.

## Domain rules
- Seed slugs match `^[a-z0-9_]+$`. Branch ids match `^br_[A-Za-z0-9]+$` and are assigned by the
  server — never invent one; omit `id` on new branches.
- Aliases must not collide with the system columns `id`, `created_at`, `updated_at`, `status`.
- A relation branch must target a slug that already exists.

## Mandatory workflow: Inspect → Validate → Plan → Apply
0. Before building a candidate, use `beech_docs_search` for anything you are unsure about
   (field types, branch policies, API reference). Do not guess from training data when the
   answer is one search away.
1. `beech_list_seeds`, then `beech_get_seed` for any seed you intend to change. Never propose a
   change to a seed you have not read.
2. `beech_schema_validate` on your candidate for a zero-latency syntax check.
3. `beech_schema_plan` — always. It returns the exact DDL, a safety classification and the
   `expectedVersion` the apply is bound to.
4. `beech_schema_apply` with the `planId` from step 3. Never call it without one.

## Safety
- A `planId` is single-use and expires after 10 minutes. Expired or already-applied ⇒ re-plan.
- **`classification: "destructive"` ⇒ STOP.** Show the developer the full `blockedReasons` and
  DDL, and wait for an explicit human answer. `beech_schema_apply` is additive-only and will
  refuse; dropping, renaming or retyping a branch is a deliberate, separate operation on its own
  endpoint. Never work around a refusal.
- HTTP 409 means another writer (usually the dashboard) changed the schema while you were
  thinking. Nothing was written. Re-run `beech_schema_plan` and show the developer the new diff.
- `ftsRebuildNeeded: true` means full-text search is rebuilt as part of the apply. If the
  response carries a `warning`, tell the developer to run the FTS rebuild endpoint it names.
- Data preservation outranks convenience. When a request would drop data, propose an additive
  alternative first.
