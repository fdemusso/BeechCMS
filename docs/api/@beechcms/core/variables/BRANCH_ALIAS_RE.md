[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / BRANCH\_ALIAS\_RE

# Variable: BRANCH\_ALIAS\_RE

> `const` **BRANCH\_ALIAS\_RE**: `RegExp`

Allowed charset for a branch alias. An alias becomes a raw SQL column name in
CREATE TABLE / ADD COLUMN / CREATE INDEX and in SELECT/WHERE/ORDER BY clauses
(see engine.ts), so it MUST be restricted to a safe identifier charset to
prevent DDL/query injection. Exported so the seeds API rename route reuses the
exact same guard — do not inline a divergent copy.
