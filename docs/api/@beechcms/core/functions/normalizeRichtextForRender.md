[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / normalizeRichtextForRender

# Function: normalizeRichtextForRender()

> **normalizeRichtextForRender**(`value`): `JSONContent` \| `null`

Accetta JSON TipTap (`{ type: 'doc', ... }`) o envelope v1.
Le stringhe HTML legacy NON sono più supportate: ritornano null (drop-to-empty al render).

## Parameters

### value

`unknown`

## Returns

`JSONContent` \| `null`
