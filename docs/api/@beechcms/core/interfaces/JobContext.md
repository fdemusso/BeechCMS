[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / JobContext

# Interface: JobContext

Execution context handed to every job. Botanical Invariant: jobs receive the
engine-mediated repository, NEVER a raw D1Database. `env` is a read-only,
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

### repository

> **repository**: [`ContentRepository`](ContentRepository.md)
