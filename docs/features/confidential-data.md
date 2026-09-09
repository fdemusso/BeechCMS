---
title: Confidential Data & Field Lifecycle
description: Field-level encryption, hash policies, zero-knowledge verification, and cryptographic field rotation in BeechCMS.
---

# Confidential Data & Field Lifecycle

BeechCMS is designed from the ground up for privacy-first content modeling. Rather than treating all database columns as plain text, the Botanical Engine enforces **Field Privacy Policies** directly at the field (Branch) level.

This enables organizations to handle PII (Personally Identifiable Information), GDPR-sensitive records, API credentials, and confidential fields with cryptographic guarantees at rest in Cloudflare D1.

<p align="center">
  <img src="/images/confidential-data-pipeline.svg" alt="BeechCMS Confidential Data & Field Privacy Lifecycle" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Privacy Policy Modes

When defining branches in a Seed, developers configure the `privacy` policy:

| Privacy Policy | Storage in D1 | Read Behavior | Rotation / Edit |
| :--- | :--- | :--- | :--- |
| `plain` (default) | Plaintext string/JSON | Returned in read queries | Standard CRUD |
| `hash` | Salted SHA-256 hash | Never returned (`null` on reads) | Rotated via `POST /rotate-field` |
| `confidential` / `encrypted` | Encrypted payload | Only decrypted for authorized roles | Direct authenticated update |

```typescript
import { defineSeed } from '@beechcms/core'

export const CustomerSeed = defineSeed({
  slug: 'customers',
  name: 'Customers',
  branches: [
    { alias: 'name', type: 'text', required: true },
    { alias: 'email', type: 'text', required: true },
    {
      alias: 'apiSecret',
      type: 'text',
      policies: {
        privacy: 'hash', // [!code highlight]
      }
    },
    {
      alias: 'taxId',
      type: 'text',
      policies: {
        privacy: 'confidential', // [!code highlight]
      }
    }
  ]
})
```

---

## Cryptographic Field Rotation (`rotate-field`)

Fields protected with `privacy: 'hash'` can never be read back through the API. To change or update their value securely (for example, rotating an API key or updating a secret passphrase), BeechCMS provides the dedicated `POST /:slug/:id/rotate-field` endpoint.

This endpoint enforces a zero-knowledge challenge-response:
1. The client must supply `currentValue` alongside `nextValue`.
2. The server computes the verification against the existing stored hash.
3. If and only if the current value matches, the new value is hashed with fresh entropy and persisted.

### API Request

```http
POST /api/content/customers/cust_9812/rotate-field
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "fieldAlias": "apiSecret",
  "currentValue": "sec_live_oldValue123",
  "nextValue": "sec_live_newFreshSecret456"
}
```

### Response

```json
{
  "success": true,
  "fieldAlias": "apiSecret"
}
```

If the verification fails:

```json
{
  "type": "rotate-field-current-value-mismatch",
  "title": "Forbidden",
  "status": 403,
  "detail": "Provided currentValue does not match the stored hash for field 'apiSecret'"
}
```

---

## Draft & Staging Protections

To prevent accidental leakages or bypasses:
- **Draft Staging Immunity**: Modifying a sensitive or confidential field via the `/draft` endpoint is strictly forbidden (`422 content-sensitive-field-edit`).
- **Activity Log Masking**: Changes to confidential and hashed fields are recorded with redacted values (`[REDACTED]`) in audit logs.
- **Public API Redaction**: The Public API automatically strips confidential fields regardless of query parameters.
