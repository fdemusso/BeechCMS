[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / Branch

# Interface: Branch

Branch: definition of a single field. `alias` is the SQL column name.

## Properties

### alias

> **alias**: `string`

Human-readable alias, used in the API payload and as the SQL column name in the dedicated table.

***

### fields?

> `optional` **fields?**: `Branch`[]

Sub-schema for `type === 'repeater'`. Each item of the repeater's array
value is a record keyed by sub-branch alias, validated against this list.
Sub-branches are restricted to leaf/scalar types (no nested `repeater`,
`relation`, or `file`) — enforced by validation.ts and seed-validation.ts.
Ignored for any other branch type.

***

### fileOptions?

> `optional` **fileOptions?**: [`FileFieldOptions`](FileFieldOptions.md)

Advanced options for file fields. Ignored if type !== 'file'.

***

### format?

> `optional` **format?**: `"date"` \| `"plain"` \| `"markdown"` \| `"html"` \| `"datetime"` \| `"asset-list"`

Optional semantic variant of the field for UI/validation purposes.
`asset-list` on a multiple `file` branch enables gallery management.

***

### hint?

> `optional` **hint?**: `string`

Optional help text shown as a tooltip next to the label in the form. UI-only, ignored by the engine.

***

### id

> **id**: `string`

Stable logical id of this branch, e.g. 'br_01', 'br_title'.
Format: ^br_[A-Za-z0-9]+$ — enforced by SeedRegistry at boot (sprint 04-pre).

Used by every persistence layer that needs a reference that survives alias renames
(FTS triggers, draft indexing, layout JSON, automations). NEVER use alias for that purpose.

The Botanical Engine still emits alias as the SQL column name; id is a logical handle.

***

### label

> **label**: `string`

UI display label.

***

### maxItems?

> `optional` **maxItems?**: `number`

Maximum number of items a `repeater` value may contain. Repeater-only — ignored
for every other branch type. `maxItems: 1` models a single "object" column.
Must be a non-negative integer and `>= minItems` when both are set.

***

### minItems?

> `optional` **minItems?**: `number`

Minimum number of items a `repeater` value must contain when a value is
provided. Repeater-only — ignored for every other branch type.

NOTE: this constrains array *length when the field is present*. It does NOT by
itself make the field mandatory — an absent/null payload is still allowed unless
`requiredOnCreate` / `requiredOnUpdate` is also set. To model "exactly one
required object", combine `minItems: 1, maxItems: 1, requiredOnCreate: true`.
Must be a non-negative integer and `<= maxItems` when both are set
(enforced at boot by seed-validation.ts).

***

### multiple?

> `optional` **multiple?**: `boolean`

Optional cardinality for media fields:
- false/undefined: single asset (string URL)
- true: asset list (string[] URL)

***

### numberOptions?

> `optional` **numberOptions?**: [`NumberFieldOptions`](NumberFieldOptions.md)

Advanced options for number fields. Ignored if type !== 'number'.

***

### onDelete?

> `optional` **onDelete?**: `"CASCADE"` \| `"SET NULL"` \| `"RESTRICT"`

SQLite ON DELETE rule applied to the foreign-key constraint.
Defaults to 'SET NULL' when `type === 'relation'` and no value is provided.
- CASCADE  : delete dependent rows when the parent is deleted.
- SET NULL : null out the column when the parent is deleted (default).
- RESTRICT : block parent deletion while dependent rows exist.

NOTE: When `multiple: true` (introduced in Sprint 5 for many-to-many), this
rule applies to the FK from the junction table to the target table.

***

### options?

> `optional` **options?**: `string`[]

Predefined vocabulary for tag/select/multiselect fields.
Static list defined in the Seed (not persisted to the DB).

***

### policies?

> `optional` **policies?**: `object`

Access and handling policy for the field.
All values are optional — `resolvePolicies(branch)` supplies the defaults.

#### filter?

> `optional` **filter?**: `boolean`

Whether the field is available as a filter column in the dashboard. Default: true.

#### privacy?

> `optional` **privacy?**: `"plain"` \| `"hash"` \| `"encrypt"`

How the value is stored. Default: 'plain'.

#### public?

> `optional` **public?**: `boolean`

Whether the field is included in Public API responses. Default: true.

#### search?

> `optional` **search?**: `boolean`

Whether the field is included in full-text search queries. Default: true.

#### sort?

> `optional` **sort?**: `boolean`

Whether the field is available as a sort column in the dashboard. Default: true.

#### visibility?

> `optional` **visibility?**: `"full"` \| `"masked"` \| `"hidden"`

How the value is returned in API responses. Default: 'full'.

***

### requiredOnCreate?

> `optional` **requiredOnCreate?**: `boolean`

Required on create — generates NOT NULL in generateCreateTable.

***

### requiredOnUpdate?

> `optional` **requiredOnUpdate?**: `boolean`

Required on update.

***

### targetSeed?

> `optional` **targetSeed?**: `string`

Slug of the referenced Seed (without the `content_` prefix).
REQUIRED when `type === 'relation'`. Ignored otherwise.
Example: 'team' → references table `content_team(id)`.

***

### type

> **type**: [`BranchType`](../type-aliases/BranchType.md)

Value type.
