[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ISchemaMutator

# Interface: ISchemaMutator

Executes additive schema DDL against the live database and introspects columns.
 Implemented by D1SchemaMutator in apps/api/src/shared/schema-mutator.d1.ts.
 This is the ONLY sanctioned channel for runtime DDL — handlers never touch env.DB.

## Methods

### dropColumn()

> **dropColumn**(`table`, `column`): `Promise`&lt;`void`&gt;

`ALTER TABLE {table} DROP COLUMN {column}`.

#### Parameters

##### table

`string`

##### column

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### dropTable()

> **dropTable**(`table`): `Promise`&lt;`void`&gt;

`DROP TABLE IF EXISTS {table}`.

#### Parameters

##### table

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### execDdl()

> **execDdl**(`statements`): `Promise`&lt;`void`&gt;

Runs the given DDL statements in order as a single D1 batch.
 All statements must be additive (CREATE … IF NOT EXISTS / ALTER … ADD COLUMN /
 CREATE INDEX IF NOT EXISTS). Throws on the first failing statement.

#### Parameters

##### statements

`string`[]

#### Returns

`Promise`&lt;`void`&gt;

***

### execDestructive()

> **execDestructive**(`statements`): `Promise`&lt;`void`&gt;

Runs a multi-statement destructive batch atomically (FTS rebuild,
 type-change column rebuild, full type drop). The caller assembles the
 statements; the impl validates identifiers and runs them as one D1 batch.

#### Parameters

##### statements

`string`[]

#### Returns

`Promise`&lt;`void`&gt;

***

### fetchRows()

> **fetchRows**(`table`, `columns`): `Promise`&lt;`Record`&lt;`string`, `unknown`&gt;[]&gt;

Reads all rows from a table for the specified columns only.
 Used before DROP TABLE to collect R2 keys for media cleanup.
 All identifiers are validated against `^[A-Za-z0-9_]+$`.

#### Parameters

##### table

`string`

##### columns

`string`[]

#### Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;[]&gt;

***

### getColumns()

> **getColumns**(`table`): `Promise`&lt;`Set`&lt;`string`&gt; \| `null`&gt;

Column names currently on a table, or null if the table does not exist.

#### Parameters

##### table

`string`

#### Returns

`Promise`&lt;`Set`&lt;`string`&gt; \| `null`&gt;

***

### renameColumn()

> **renameColumn**(`table`, `from`, `to`): `Promise`&lt;`void`&gt;

`ALTER TABLE {table} RENAME COLUMN {from} TO {to}`.

#### Parameters

##### table

`string`

##### from

`string`

##### to

`string`

#### Returns

`Promise`&lt;`void`&gt;
