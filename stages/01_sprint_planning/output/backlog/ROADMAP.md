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

## S1 — `BulkTransferCorePrimitives` *(CURRENT — detailed plan in `output/BulkTransferCorePrimitives.md`)*

- **Goal:** ship the pure, transport-free primitives every later sprint depends on: format
  encoders/decoders, the flat-vs-relational seed predicate, shared thresholds, and the
  `JobContext.queue` contract extension that makes chunk self-continuation possible.
- **Deliverables:** new `packages/core/src/transfer/` module (CSV RFC4180 + NDJSON codecs,
  `isFlatSeed`, `checkFormatCompatibility`, export column projection, import payload mapping,
  shared constants) with unit tests; `JobContext.queue: IQueueService` added to
  `packages/core/src/queue/queue.interface.ts`; the four `apps/api` construction sites updated
  to satisfy the new required field. **Zero routes, zero migrations, zero UI.**
- **Depends on:** nothing.

## S2 — `ContentExportStream`

- **Goal:** expose synchronous, chunked, streaming export of a content type over HTTP.
- **Deliverables:** `GET /api/content/:slug/export?format=` in the `content` slice; a
  `ReadableStream` producer that pages `repository.findMany` and never materialises the whole
  result set; `400` when CSV is requested for a non-flat seed; `413` when the row count exceeds
  the configurable cap; `permission.middleware.ts` route rule at `content:read` / `capture1`;
  integration tests against real D1.
- **Depends on:** S1 (codecs, `checkFormatCompatibility`, `exportColumns`, cap constant).

## S3 — `ContentImportJobs`

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
  S2 only for shared route-rule placement conventions — it does not import S2 code.

## S4 — `BulkTransferDashboard`

- **Goal:** give the dashboard an export button and an import wizard with job progress.
- **Deliverables:** export action in the content list toolbar (format picker, CSV disabled with
  an explanation for non-flat seeds); import wizard driving presign → PUT → `POST /import`;
  a job detail view polling the status endpoint and rendering the capped error report.
- **Depends on:** S2 and S3 (both endpoint surfaces must be merged and stable).
