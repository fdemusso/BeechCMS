# Sprint 04 — Customizable Entry Editor (Index)

> This sprint has been **split into three sub-sprints** so each one can be handed
> to an AI agent independently. Read them in order.

## Goal
Transform `entry-editor.tsx` into a layout-driven editor where admins can
visually customize the form (Tabs → Sections → Columns → Fields) via a
drag-and-drop builder. End-state matches `docs/images/EditorCustom.png`
(viewer) and `docs/images/editorPersonalizzazione.png` (builder).

## Sub-sprints

| File | Scope |
|---|---|
| [04-pre — Foundation Fixes](./04-pre-foundation-fixes.md) | **Prerequisite.** Part A: introduce stable `Branch.id` (`br_XX`), assign ids to all seeds, boot-time validation, `findBranchById` helper, `STABLE_ID_AUDIT.md` backlog. Part B: unify `JwtPayload` on core `JwtClaims`, add `role`/`surname` claims, propagate at issue/decode. Must land before 04a. |
| [04a — Foundation](./04a-customizable-editor-foundation.md) | Core types, default layout generator, validator, `seed_layouts` D1 table, `ISeedLayoutRepository`, `GET /api/schema` enrichment, `PUT/DELETE /api/schema/:slug/layout`, RBAC constant. No visible UI change. |
| [04b — Renderer & Dialog](./04b-customizable-editor-renderer.md) | Rewrite `entry-editor.tsx` to render from `seed.layout` (or generated default). Convert the editor surface from a full page to a Shadcn `<Dialog>` opened over the content list — URL-driven open state preserves direct-linking. |
| [04c — Layout Builder UI](./04c-customizable-editor-builder.md) | The drag-and-drop builder dialog (`@dnd-kit`): admin-only "Edit Layout" button, sortable sections/columns/fields, section context menu, field picker, full-width auto-enforcement, Save / Reset / Show Preview. |

## Key decisions (cross-cutting)

- **Layout is global per Seed** (not per-user, no versioning, no rollback). Reset
  = revert to generated default.
- **Default layout** = 2 tabs `Data` + `SEO`, fields grouped by type in 3-column
  sections, RichText + Gallery (`file` + `multiple:true`) in dedicated full-width
  sections, branches iterated in seed-declaration order. Hidden branches and
  system aliases (`id`, `slug`, `status`, `created_at`, `updated_at`) excluded.
  `json` branches **temporarily excluded** until the JSON editor is rewritten.
- **RBAC:** only `admin` can edit the layout today, encoded as a single
  `ROLES_ALLOWED_TO_EDIT_LAYOUT` constant in `@beechcms/core` to keep extension
  trivial.
- **Branch references:** the layout stores `branchId` (stable `br_XX`, introduced
  in 04-pre Part A). Never use aliases as layout keys — aliases are SQL column
  names and may change.
- **Auto-cleanup:** when a referenced branch no longer exists on the Seed, it
  is silently stripped on read (server-side enrichment + client-side renderer
  guard).
- **UI shell:** real Shadcn `<Dialog>` over the content list. **No
  glassmorphism, no premium floating styling.** Standard look.
- **Forward-compatibility:** Seeds will become DB-resident at runtime in a
  future sprint. The layout store is keyed by Seed `slug` and is independent
  of where the Seed definition lives, so it will keep working unchanged.

## Mockups
- `docs/images/EditorCustom.png` — final viewer (what end users see when filling
  in an entry).
- `docs/images/editorPersonalizzazione.png` — the Layout Builder UI (admin only).

Both mockups use the dark theme. Beech's existing dark theme styling applies —
no special overlay needed.
