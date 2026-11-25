[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ExcludedOperationSpec

# Interface: ExcludedOperationSpec

An operation no agent may call, whatever scope it holds.

## Extends

- `OperationBase`

## Properties

### docs?

> `optional` **docs?**: `string`

File under `docs/reference/`, e.g. `internal-content.md`.

#### Inherited from

`OperationBase.docs`

***

### excludedReason

> **excludedReason**: `string`

Why no agent may call this, one sentence. Required: an exclusion without a reason is a finding.

***

### exposure

> **exposure**: `"excluded"`

***

### id

> **id**: `string`

Stable `domain.camelCaseVerb` id, e.g. `content.bulkUpdate`. Never reused.

#### Inherited from

`OperationBase.id`

***

### method

> **method**: [`OperationMethod`](../type-aliases/OperationMethod.md)

#### Inherited from

`OperationBase.method`

***

### path

> **path**: `string`

Hono route pattern, byte-identical to `createBeechApp().routes[].path`.

#### Inherited from

`OperationBase.path`

***

### summary

> **summary**: `string`

One English sentence, imperative, no trailing period.

#### Inherited from

`OperationBase.summary`
