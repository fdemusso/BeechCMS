# Field Policies & Application-Level Encryption (ALE)

BeechCMS provides field-level security policies and zero-knowledge encryption primitives directly integrated into the Botanical Engine and Cloudflare D1.

---

## Granular Branch Policies

Every Branch can define an optional `policies` configuration object controlling privacy, security classification, indexing, and API visibility:

```typescript
policies?: {
  classification?: 'public' | 'internal' | 'confidential' | 'restricted'
  privacy?: 'plain' | 'hash' | 'encrypt'
  visibility?: 'full' | 'masked' | 'hidden'
  public?: boolean
  publicEdit?: boolean
  filter?: boolean
  sort?: boolean
  search?: boolean
}
```

### Policy Properties Breakdown

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `classification` | `enum` | `'public'` | Security classification level governing export restrictions, masking, and auditing. |
| `privacy` | `enum` | `'plain'` | Physical storage transformation: `'plain'`, `'hash'` (one-way HMAC-SHA256), or `'encrypt'` (AES-256-GCM). |
| `visibility` | `enum` | `'full'` | How the value is rendered in API responses: `'full'`, `'masked'` (renders as `••••••••`), or `'hidden'` (completely omitted). |
| `public` | `boolean` | `true` | When `false`, excludes the field completely from unauthenticated public REST endpoints. |
| `publicEdit` | `boolean` | `false` | Controls whether unauthenticated public mutations can modify this specific branch. |
| `filter` | `boolean` | `false` | Generates a dedicated B-tree index (`idx_{seed}_{alias}`) in D1 for fast SQL `WHERE` queries. |
| `sort` | `boolean` | `false` | When `true`, enables SQL `ORDER BY` operations on this column. |
| `search` | `boolean` | `false` | Includes this field in SQLite FTS5 full-text indexing and search ranking. |

> [!NOTE]
> Custom branches do not support a `unique` policy in D1 (only the system `slug` carries a `UNIQUE` constraint). For full public read isolation, combine `public: false` with `classification: 'internal'` or `classification: 'confidential'`. Note that `classification: 'confidential'` automatically implies storage `'encrypt'`.

---

## Application-Level Encryption (ALE)

When `privacy: 'encrypt'` (or `classification: 'confidential'`) is enabled on a branch, BeechCMS enforces **AES-256-GCM authenticated encryption** at rest before data touches SQLite D1:

<p align="center">
  <img src="/images/ale-blind-indexing-pipeline.svg" alt="Application-Level Encryption and Blind Indexing Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

- **Format**: Values are stored using the versioned envelope `v1:<iv_base64>:<ciphertext_base64>` (Base64-encoded strings native to Cloudflare Workers with zero external dependencies).
- **Key Derivation**: Symmetrically derives a 256-bit AES-GCM CryptoKey directly from `PRIVACY_MASTER_KEY` via `crypto.subtle.digest('SHA-256', ...)`.
- **Zero-Knowledge at Edge**: Database dumps, SQLite backups, and raw D1 queries reveal only encrypted ciphertext.

---

## Blind Indexing for Encrypted Fields

A classic drawback of database encryption is the inability to search or filter encrypted columns using SQL B-tree indexes without decrypting every row in memory.

BeechCMS solves this via **Blind Indexing**:

1. When a branch has both `privacy: 'encrypt'` (or `classification: 'confidential'`) and `filter: true`, the Botanical Engine automatically provisions a companion column:
   ```sql
   ALTER TABLE content_users ADD COLUMN email_bidx TEXT;
   CREATE INDEX idx_users_email_bidx ON content_users (email_bidx);
   ```
2. On every insert or update, BeechCMS computes an HMAC-SHA256 digest of the normalized input using a derived HMAC key:
   ```text
   email_bidx = HMAC_SHA256(hmacKey, normalize(input))
   ```
3. When querying `/api/content/users?email=test@example.com`, BeechCMS computes the blind index hash of the search parameter and executes an indexed B-tree equality check against `email_bidx` in `O(log N)` time without decrypting any database rows.

---

## Master Key Provisioning

Application-Level Encryption requires a 256-bit cryptographic master key (`PRIVACY_MASTER_KEY`).

### Local Development
Generate a 32-byte hex key and add it to `.dev.vars`:

```bash
# Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.dev.vars`:
```bash
PRIVACY_MASTER_KEY=4a2f8c9b... # 64 hex characters
```

### Cloudflare Edge Production
Provision the key as a Cloudflare secret:

```bash
npx wrangler secret put PRIVACY_MASTER_KEY
```

---

## Data Classification Tiers

BeechCMS categorizes data into 4 governance tiers:

1. **`public`**: Non-sensitive marketing content, blog posts, and public assets. Full visibility across public APIs.
2. **`internal`**: Internal business operational data. Available to authenticated CMS users; stripped from public endpoints when `public: false`.
3. **`confidential`**: Personal Identifiable Information (PII) such as phone numbers, billing addresses, or employee data. Defaults to `visibility: 'masked'` (`••••••••`) on read endpoints unless accessed by authorized roles.
4. **`restricted`**: Highly sensitive credentials, API keys, or verification secrets. Always paired with `privacy: 'hash'` or `privacy: 'encrypt'` and `visibility: 'hidden'`.

### Example Branch Configuration

```typescript
branches: [
  {
    id: 'br_01',
    alias: 'phone',
    label: 'Customer Phone',
    type: 'text',
    policies: {
      classification: 'confidential',
      privacy: 'encrypt',
      visibility: 'masked',
      public: false,
      filter: true // Enables phone_bidx blind index
    }
  },
  {
    id: 'br_02',
    alias: 'api_secret',
    label: 'Webhook Secret',
    type: 'text',
    policies: {
      classification: 'restricted',
      privacy: 'hash',
      visibility: 'hidden',
      public: false
    }
  }
]
```
