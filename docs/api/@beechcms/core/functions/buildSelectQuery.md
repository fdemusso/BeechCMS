[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / buildSelectQuery

# Function: buildSelectQuery()

> **buildSelectQuery**(`seed`, `options?`): [`ParameterizedQuery`](../interfaces/ParameterizedQuery.md)

Builds a parameterized SQL SELECT query and bindings for a given Seed based on search, filtering, status, and ordering options.

If `options.isCount` is set to `true`, it generates a counting query (`COUNT(*) as total`) rather than returning database rows.
In count mode, column projections (`fields`), ordering (`orderBy` / `kanbanOrder`), and pagination (`LIMIT` / `OFFSET`) clauses and
bindings are omitted, while join and filtering clauses are preserved.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### options?

[`SelectOptions`](../interfaces/SelectOptions.md) = `{}`

Query configuration options.

## Returns

[`ParameterizedQuery`](../interfaces/ParameterizedQuery.md)

The SQL query string and bindings.

## Example

```ts
const { sql, bindings } = buildSelectQuery(postSeed, {
  status: 'published',
  filters: [{ column: 'title', type: 'text', conditions: [{ op: 'contains', value: 'cms' }] }],
  orderBy: { column: 'created_at', dir: 'DESC' },
  pagination: { limit: 20, offset: 0 },
})
```
