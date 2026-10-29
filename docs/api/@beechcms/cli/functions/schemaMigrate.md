[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaMigrate

# Function: schemaMigrate()

> **schemaMigrate**(`args?`): `Promise`&lt;`void`&gt;

Moves seeds saved before 0.9 to the closed-vocabulary `tags` contract: `text` + `options` becomes
single-choice `tags` with its stored strings wrapped into arrays, and string `options` become
`{ value, color }`.

Dry run by default. `--apply` writes stored values first, then the seed definitions, then bumps the
registry version so running Workers rebuild their cached registry. The statements are idempotent, so
re-running after an interruption finishes the job. Values outside the new vocabulary are reported and
left in place; a seed with an unresolved branch is not rewritten at all.

## Parameters

### args?

[`SchemaMigrateOptions`](../interfaces/SchemaMigrateOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
