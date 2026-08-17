[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ResolvedClassification

# Interface: ResolvedClassification

Resolved classification rules for a branch, bundling storage strategy and API visibility defaults.

## Properties

### authVisibility

> **authVisibility**: `"full"` \| `"hidden"`

Default visibility rule for authenticated API endpoints (`full` or `hidden`).

***

### classification

> **classification**: [`DataClassification`](../type-aliases/DataClassification.md)

Canonical data classification tier.

***

### publicVisibility

> **publicVisibility**: `"full"` \| `"hidden"`

Default visibility rule for unauthenticated public API endpoints (`full` or `hidden`).

***

### storage

> **storage**: `"plain"` \| `"hash"` \| `"encrypt"`

Storage mechanism at rest (`plain`, `encrypt` via AES-GCM, or `hash` via HMAC-SHA256).
