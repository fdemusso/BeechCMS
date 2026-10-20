# Changelog

## [0.9.0] — changes since v0.8.1

Covers `v0.8.1..HEAD` (2026-09-30 → 2026-10-20, ~270 commits).

### Highlights

- **RBAC** — full role/permission system: permission vocabulary and evaluator, D1 storage, route enforcement, user/role/assignment admin API, invitation onboarding (copy-link invites), scoped listing endpoints, and dashboard surfaces with permission-aware gating.
- **Saved Views** — view types, view instances and a view harness (#533), with `TagChoiceViews` and closed-vocabulary tags (#713).
- **Field-Level Localization** — localized fields, locale switcher in the entry editor (#437).
- **Soft delete & Trash** — soft delete backend, dashboard Trash, GDPR purge.
- **Bulk data transfer** — export streams, bulk-transfer codecs, async chunked import jobs, transfer dashboard.
- **Schema manifest tooling** — `beech.schema.ts` DSL, schema introspection fingerprint, `beech schema plan/apply`, `beech types check`, `beech schema audit` for stranded relation storage (#664).
- **Client SDK** — fluent query builder with sorting, pagination, search and relation subqueries; public API relation expansion.
- **Edge media presets** — preset transformations and URL builders (#436).
- **Large security/hardening pass** — ~100 fixes from audit issues (see Security).

### Added

- **RBAC**: core permission vocabulary/evaluator; permission gate on protected routes; user/role/assignment admin API; invitation lifecycle; scoped listings and `settings/me`; dashboard RBAC surfaces, invite redemption and permission-derived navigation; content action gating with tooltips; role icons, modernized Users/Roles tabs and Manage Roles dialog; password strength indicator on invite acceptance; copy-link invites.
- **Saved Views** (#533), `TagChoiceViews` and closed-vocabulary tags (#713).
- **Table view**: persisted column order with type-aligned columns, keyboard selection and shortcuts, `id`/`created_at`/`updated_at` in the column picker, improved pill component.
- **Field-Level Localization** (#437) with globe-icon locale switcher and status colors.
- **Soft delete** backend and **Trash** dashboard; purge action for soft-deleted seeds (#772); hard-delete of soft-deleted seeds (#718).
- **Bulk transfer**: `ContentExportStream`, codecs and queue producer port, async chunked import jobs (`ContentImportJobs`), bulk transfer dashboard.
- **Optimistic concurrency control** on content update and draft publish (#74, #431).
- **Schema tooling**: `beech.schema.ts` manifest DSL, introspection fingerprint, `schema plan`/`apply`, `types check` CI drift guard (#425), `schema audit` (#694).
- **Client SDK**: fluent query builder, sorting/pagination/search, relation subqueries.
- **Public API**: relation expansion.
- **Media**: edge-native preset transformations and URL builders (#436).
- **Testing**: real-D1 integration harness, tier-aware CI runner (`--tier`), Playwright e2e tier, scale performance tier, local thermal/memory budget protection for test runners, machine-wide CPU slot.
- **CI/Release**: Dependabot auto-merge and release pipeline (#424).
- **Dashboard**: "not implemented" toast for templates, scheduled and create-new.
- **Docs**: query system, `beech.schema.ts`, RBAC, Trash/soft delete/GDPR purge, field localization, media presets, `@beechcms/testing` harness; ultra-wide responsive docs layout.

### Changed

- Public API and engine reorganized into vertical slices (#456, #450); `ContentListPage` and `DataTable` refactored (#376).
- Dead code checks and removal (#714); removed dead `seed-ddl-destructive` module (#527).
- MinIO replaced in Docker stack/CI (dead images).
- Test fixtures made resilient to system seeds and schema bumps.

### Fixed

**Dashboard / views**
- Kanban: blank position treated as unpositioned (#758), one card slot per branch (#757), exact query key in cache (#753), `activeFilters` passed through (#755), read-only users can open cards (#756), tag swap guarded by OCC (#476).
- Gallery: pagination wired (#748), retry image on URL change (#751), folder key cap (#750), TipTap plain-text extraction (#747).
- Toolbar: conditional-format rule kept (#741), menus close on selection (#740), search bar opens with active query (#739).
- Views: date group precision (#761), autosave retry (#762), RFC 9457 problem slug (#760).
- Dashboard widgets: empty builder columns as drop target (#769), end-of-day presets (#768), seed-gated queries (#767), setup checklist link (#766), new widgets kept on layout save (#764), QuickDraftWidget effective seed (#765).
- Seed builder: form resync with Danger Zone (#774), navigation blocker (#771).
- Settings: storage pagination (#773), media scanning for richtext/json/avatars (#736), orphaned media cleanup (#676), paginated storage orphans (#613).
- Entry editor: sends `If-Match`, distinguishes update/slug conflicts (#474), surfaces draft validation (#517).

**Content & seeds**
- Atomic DDL + definitions commit (#555); media staged before hard delete (#618); repeater subfield ids and media purge (#776, #777); seed route hardening (#619); orphan column drops (#617); `displayNameAlias` kept valid (#615); lossy retype rejected (#524); indexes/FTS triggers dropped before `DROP COLUMN` (#523); FTS rebuild on searchable branch (#525); reserved-word/duplicate alias checks on rename (#526, #539).
- Draft saves: version guard (#475), encrypt-privacy fields (#579), title visibility (#578).
- Import: deterministic chunk slug (#477), `objectKey` namespace binding (#571); bulk set validation (#572); bulk array-relation writes vs trashed rows (#467).
- Required localized branch handling on update (#438, #440); richtext/localized non-flat sets (#464); repeater required sub-fields (#444); validation low-severity findings (#445).

**Search**
- `deleted_at IS NULL` in FTS/search/backref queries (#465, #466); richtext body text indexing (#451); serialized R2 index compilation (#609); public index gated (#607); default page size on bad limit (#608); manifest schema alignment (#407).

**Automations**
- `edit_field` and `create_entry` sanitization (#471, #744); trigger conditions on cron batch actions (#557); `set_variable` result exposure and strict filter handling (#558, #559); per-sink escaping and JSON-escaped webhooks (#562, #563); seed-scoped template refs (#564); GET webhooks omit body (#742); rematerialization keeps seed/pin (#745); low-severity cron/proto-key fixes (#565).

**Misc**
- CLI: Wrangler without shell parsing (#518), CRLF normalization (#478), `beech dev` flag merge, `.dev.vars` check, CPU slot in `beech test` (#653), Windows path tests (#647).
- MCP: supervisor restart races (#473), resource bundling cache (#496), unresolvable private dependency no longer shipped (#463).
- Client: chained `where()` merged per field (#472).
- Rate limiter: persisted registry, bounded buckets (#453–#458, #634).
- Webhooks: QStash redelivery dedupe (#586); notification ETag from content (#582); email template HTML escaping (#479).
- DB: RBAC/`is_active` moved out of already-applied base migration (#462); legacy role backfill (#512).
- Media: signature/URL-extension handling (#531, #452); scale variants on effective ceiling (#593).

### Security

- Hidden/masked field leaks closed in content, drafts, widgets and backrefs; default filter/sort/search off for hidden fields (#514, #570, #581, #566, #513, #469).
- Developer-account protection enforced server-side (#515); inactive accounts gated on custom routes and OAuth (#574, #480).
- OAuth refresh-token reuse detection revokes family (#516); token endpoint limiter keyed on credential hash (#587); revoke sessions on password change (#611).
- Password reset: atomic token redemption (#589, #590), non-object bodies and inactive accounts rejected, latency equalised (#591).
- RBAC: last-global-admin invariant enforced in-statement (#596), scope-aware role edit/delete (#595), atomic invitation redeem, SuperAdmin granted atomically on setup (#602).
- Hash fields use keyed HMAC (#521, #600); `PRIVACY_MASTER_KEY` fail-closed (#568); encrypted filters rejected (#522, #584).
- Public API: filter policy on relation subqueries (#631), `publicEdit:false` enforced (#625), time-trap token atomic claim (#627), internal error details redacted (#621), caller-supplied bucket keys never deleted (#624).
- Uploads: proxied multipart fallback refused in production (#594); atomic upload registration (#592).
- `sanitizeHtml`, `media()` host check, prototype-pollution lookups, DoS pre-check depth, layout size caps (#519, #520, #576, #605, #443).
- Dependency patches for audit findings (#733–#735; axios, hono, sharp, fast-uri, MCP SDK, follow-redirects).

### In progress (uncommitted in working tree)

- `beech schema migrate` command and seed tag migration (`tag-migration`), with tests and a `schema audit` update.
