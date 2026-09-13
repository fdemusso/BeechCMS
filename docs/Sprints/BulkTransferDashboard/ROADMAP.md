# ROADMAP — Bulk Data Transfer (Export / Import)

The feature brief (`stages/00_ideation/output/feature_brief.md`) does **not** fit one sprint.
It requires sequential merges across three tiers: a `@beechcms/core` contract change must land
before `apps/api` can consume it, the import consumer cannot exist before the `import_jobs`
system seed is bootstrapped by a D1 migration, and the dashboard cannot call endpoints that do
not exist yet. Export and import are also independent boundaries that must be validated
separately — export is synchronous and stateless, import is asynchronous and stateful.

Sprints are executed in order. Each row is a roadmap entry only. **Detailed Task Details exist
for the current sprint only**; future entries stay at this level of resolution until their turn,
because the graph and the codebase will have moved by then.

---

## S1 — `BulkTransferCorePrimitives` *(SHIPPED — archived at `docs/Sprints/BulkTransferCorePrimitives/`, review verdict PASS)*

- **Goal:** ship the pure, transport-free primitives every later sprint depends on: format
  encoders/decoders, the flat-vs-relational seed predicate, shared thresholds, and the
  `JobContext.queue` contract extension that makes chunk self-continuation possible.
- **Shipped:** `packages/core/src/transfer/` (CSV RFC4180 + NDJSON codecs, `isFlatSeed`,
  `checkFormatCompatibility`, `exportColumns`, row↔payload mapping, shared constants) with four
  unit suites; required `JobContext.queue: IQueueService` in
  `packages/core/src/queue/queue.interface.ts`; the six `apps/api` `JobContext` construction sites
  updated. Zero routes, zero migrations, zero UI. `InMemoryQueueService`'s self-reference resolved
  by post-construction assignment rather than by making the field optional.
- **Depends on:** nothing.

## S2 — `ContentExportStream` *(SHIPPED — archived at `docs/Sprints/output/ContentExportStream.md`)*

- **Goal:** expose synchronous, chunked, streaming export of a content type over HTTP — the first
  production consumer of the S1 primitives.
- **Deliverables:** `GET /api/content/:slug/export?format=` in the `content` slice; a
  `ReadableStream` producer that pages `repository.findMany` with a **keyset cursor on `id`** and
  never materialises the whole result set; `400` when CSV is requested for a non-flat seed; `400`
  for an unknown format; `413 content-export-too-large` when the row count exceeds the
  `EXPORT_MAX_ROWS` cap, refused before the first byte; a `permission.middleware.ts` route rule at
  `content:read` / `capture1`; `413` added to the `problem-details.ts` status union; one unit suite
  for the producer and one integration suite against real D1. **Zero core changes, zero migrations,
  zero UI.**
- **Depends on:** S1 (codecs, `checkFormatCompatibility`, `exportColumns`,
  `DEFAULT_EXPORT_MAX_ROWS`, `DEFAULT_EXPORT_PAGE_SIZE`).

## S3 — `ContentImportJobs` *(SHIPPED — archived at `docs/Sprints/ContentImportJobs/ContentImportJobs.md`)*

- **Goal:** asynchronous, chunked, best-effort, insert-only bulk import with a durable,
  engine-mediated job record.
- **Deliverables:** D1 migration bootstrapping the `import_jobs` **system seed**
  (`seeds.source = 'code'`, `content_import_jobs` table emitted by `planCreateSeed`);
  `POST /api/content/:slug/import` (accepts an R2 object reference produced by the existing
  `/api/upload/presign` flow, never a file body; creates the job; enqueues the first chunk);
  the `content_import_chunk` job handler (reads its slice of the R2 object, validates each row
  with `validateAndSanitizeSeedPayload`, inserts via `JobContext.repository`, persists the row
  offset + partial report, re-enqueues itself via `JobContext.queue`, deletes the R2 object on a
  terminal state); `GET /api/content/import-jobs/:id` with the creator-or-same-seed-write-scope
  authorization rule enforced in the handler; R2 lifecycle rule documented for orphans.
- **Depends on:** S1 (codecs, chunk-size constant, error-sample cap, `JobContext.queue`) and on
  S2 only for shared route-rule placement conventions and the `413` status union — it does not
  import S2 code.
- **Planning decisions carried forward (see the plan's VETO Audit):** the chunk cursor is a
  **record** offset with a full re-read per invocation — a `range` option on `BeechBucket.get` was
  examined and rejected, so S3 stays core-free; an NDJSON import file is presigned as
  `application/json`/`text/plain` because `application/x-ndjson` is not in the upload MIME
  allowlist, and adding it was rejected as widening the media surface.
- **Deferred out of S3, for a future roadmap entry:** `POST /api/upload/presign` demands
  `content:create` at GLOBAL scope, so a caller holding write scope on a single seed cannot
  presign an import file. Fixing it is an `upload`-slice route-rule change with its own blast
  radius across media uploads.

## S4 — `BulkTransferDashboard` *(PLANNED — detailed plan at `output/BulkTransferDashboard.md`)*

- **Goal:** give the dashboard an export button and an import wizard with job progress.
- **Deliverables:** export action in the content list toolbar (format picker, CSV disabled with
  an explanation for non-flat seeds); import wizard driving presign → PUT → `POST /import`;
  a job detail view polling the status endpoint and rendering the capped error report.
- **Depends on:** S2 and S3 (both endpoint surfaces must be merged and stable).
- **Endpoint surface S3 hands over:** `POST /api/content/:slug/import` → `202 { jobId }` with a
  `Location` header; `GET /api/content/import-jobs/:id` → `{ id, targetSeed, format, state,
  rowsRead, insertedRows, failedRows, errors[], createdAt, updatedAt, finishedAt }`, where `state`
  is `pending | processing | completed | failed`.
