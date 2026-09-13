[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / JobContext

# Interface: JobContext

Execution context handed to every job. Botanical Invariant: jobs receive the
engine-mediated repository, NEVER a raw D1Database, and the engine-mediated
queue port, NEVER a raw transport binding. `env` is a read-only,
stringly-typed view of bindings/secrets for things like fetch targets — it
deliberately does not expose `DB`.

## Properties

### bucket

> **bucket**: [`BeechBucket`](BeechBucket.md)

***

### clock

> **clock**: [`IClock`](IClock.md)

***

### env

> **env**: `Record`&lt;`string`, `string` \| `undefined`&gt;

***

### idGenerator

> **idGenerator**: [`IIdGenerator`](IIdGenerator.md)

***

### queue

> **queue**: [`IQueueService`](IQueueService.md)

Producer port, so a job can schedule its own successor. Required for cursor-style
jobs that process a bounded slice per invocation, persist their offset and re-enqueue
(bulk import): without it a handler would have to reach into `env` for the raw QUEUE
binding, which is exactly the transport coupling `repository` exists to prevent for D1.

***

### repository

> **repository**: [`ContentRepository`](ContentRepository.md)
