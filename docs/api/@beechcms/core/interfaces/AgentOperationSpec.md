[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AgentOperationSpec

# Interface: AgentOperationSpec

An operation an OAuth-authenticated agent may call, given the scope and risk clearance.

## Extends

- `OperationBase`

## Properties

### docs?

> `optional` **docs?**: `string`

File under `docs/reference/`, e.g. `internal-content.md`.

#### Inherited from

`OperationBase.docs`

***

### exposure

> **exposure**: `"agent"`

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

### risk

> **risk**: [`OperationRiskRule`](../type-aliases/OperationRiskRule.md)

***

### scope

> **scope**: `"content:read"` \| `"content:delete"` \| `"schema:read"` \| `"schema:write"` \| `"content:write"` \| `"media:read"` \| `"media:write"` \| `"automations:read"` \| `"automations:write"` \| `"users:read"` \| `"users:write"` \| `"settings:read"` \| `"settings:write"` \| `"analytics:read"` \| `"agent:read"` \| `"agent:approve"`

***

### summary

> **summary**: `string`

One English sentence, imperative, no trailing period.

#### Inherited from

`OperationBase.summary`
