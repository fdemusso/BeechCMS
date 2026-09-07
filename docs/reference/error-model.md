# Error Model

All API errors from the Public API use **RFC 9457 Problem Details** (obsoleting RFC 7807) with `Content-Type: application/problem+json`. Internal API errors use a standard `{ "error": "..." }` envelope.

**Public API error shape:**

```json
{
  "type": "https://beechcms.dev/problems/validation-failed",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed",
  "instance": "/api/v1/public/articoli/add",
  "errors": [
    {
      "field": "title",
      "expected": "string",
      "received": "number",
      "message": "Field 'title' expects type 'string' but received 'number'"
    },
    {
      "field": "publish_date",
      "expected": "date|ISO",
      "received": "string",
      "message": "Field 'publish_date' expects type 'date|ISO' but received 'string'"
    }
  ]
}
```

## Standard `type` URIs

| `type` Slug | HTTP Status | Meaning |
|---|---|---|
| `seed-not-found` | `404` | Content type does not exist in registry |
| `entry-not-found` | `404` | No entry with the specified UUID or slug |
| `operation-not-allowed` | `403` | Seed capability flag (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`) is `false` |
| `public-api-key-unauthorized` | `401` | Missing or invalid API key |
| `public-api-not-configured` | `403` | Required public API key environment variable is not configured |
| `forbidden-origin` | `403` | Origin header does not match allowed CORS origins |
| `validation-failed` | `400` | Field type mismatch, missing required field, or unknown alias |
| `dangerous-content` | `422` | Dangerous HTML/script markup detected in text or richtext |
| `sensitive-field-write` | `422` | Attempted to submit a confidential/encrypted field via public add |
| `sensitive-field-edit` | `422` | Attempted to modify a confidential/encrypted field via public edit |
| `honeypot-triggered` | `422` | Hidden anti-spam honeypot field was filled out |
| `time-trap-missing` | `422` | Anti-bot Time-Trap token is missing or expired |
| `time-trap-replayed` | `422` | Single-use Time-Trap token was already consumed |
| `time-trap-violation` | `422` | Form submitted too quickly (submission time below threshold) |
| `invalid-json-body` | `400` | Request body is not valid JSON |
| `invalid-filter` | `400` | Malformed filter syntax or unknown operator |
| `slug-conflict` | `409` | Slug already exists for this content type |
| `idempotency-key-conflict` | `409` | Idempotency key reused with a different payload |
| `rate-limit-exceeded` | `429` | IP or account exceeded rate limit |
| `internal-server-error` | `500` | Unhandled server error (details masked to `"An unexpected error occurred."` in production) |

> **Note:** The `errors` array is only present on `validation-failed` responses. It provides field-level detail for every field that failed validation.
