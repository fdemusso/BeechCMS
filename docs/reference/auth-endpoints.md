# Auth Endpoints

## `POST /auth/login`

Authenticates a user and issues an access token + refresh token.

**Request**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@beech.local",
  "password": "password123"
}
```

**Validation rules:**
- Email must match `/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/` and be at most 254 characters.
- Password must be between 8 and 128 characters, and must not exceed 72 bytes when UTF-8 encoded (bcrypt constraint).

**Responses**

| Status | Condition | Body |
|---|---|---|
| `200` | Login successful | `{ "token": "eyJ...", "expiresIn": "15m" }` |
| `400` | Malformed body / missing fields / validation failure | `{ "error": "Invalid request" }` |
| `401` | Wrong credentials or user not found | `{ "error": "Invalid credentials" }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests" }` (includes `Retry-After` header) |
| `500` | Internal error | `{ "error": "An error occurred" }` |

**Headers on 200:** `Set-Cookie: refresh_token=<uuid>; HttpOnly; SameSite=Strict; Max-Age=604800; Path=/auth; Secure`

**Rate limiting:** Protected by Dual-Key Token Bucket rate limiting — an IP limiter (capacity 10, refill 0.2/s) and an Account limiter by normalized email (capacity 5, refill 0.1/s).

---

## `POST /auth/refresh`

Exchanges a valid refresh token cookie for a new access token and rotates the refresh token.

**Request:** No body required. The `refresh_token` cookie is sent automatically by the browser.

**Responses**

| Status | Condition | Body |
|---|---|---|
| `200` | Refresh successful | `{ "token": "eyJ...", "expiresIn": "15m" }` |
| `401` | Cookie missing | `{ "error": "Refresh token missing" }` |
| `401` | Token expired, revoked, or replay detected | `{ "error": "Invalid refresh token" }` |
| `401` | User account not found | `{ "error": "User not found" }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests" }` |

**Rate limiting:** Token Bucket with capacity 20, refill 0.5/s.

---

## `POST /auth/logout`

Revokes the refresh token in D1 and clears the cookie.

**Request:** No body. Sends cookie automatically.

**Responses**

| Status | Body |
|---|---|
| `200` | `{ "message": "Logged out" }` |

---

## `GET /auth/features`

Returns feature flags for the dashboard. Used to conditionally show UI elements such as the "forgot password" link. **No authentication required.**

**Response `200`**

```json
{ "passwordReset": true }
```

`passwordReset` is `true` when `EMAIL_PROVIDER` is set to `smtp` (local dev via Mailpit) or the `RESEND_API_KEY` secret is configured on the Worker. When `false`, password reset is disabled — the dashboard hides the link and both password-reset endpoints return `503`.

---

## `POST /auth/forgot-password`

Triggers a password reset email. **No authentication required.**

**Request**

```http
POST /auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com", "locale": "it" }
```

**Behaviour:**
- If the email does not match any user, the response is still `200` — user existence is never revealed.
- Any existing pending reset tokens for the same user are invalidated before issuing a new one.
- The reset token has a **30-minute TTL** and is stored as a SHA-256 hash in D1 (`password_reset_tokens`).
- Email delivery is sent via Resend (production) or Mailpit (local dev) using `sendPasswordResetEmail` in a non-blocking `waitUntil` task.
- The reset link is `${APP_URL}/admin/reset-password?token=<plaintext_token>`.
- The `locale` field selects the email language: `'en'` (default) or `'it'`.
- Rate limited via Dual-Key Token Bucket: IP capacity 5 (refill 0.05/s) and Account capacity 3 (refill 0.02/s).

**Required environment variables:**

| Variable | Description |
|---|---|
| `EMAIL_PROVIDER` | `smtp` (dev/test via Mailpit) or `resend` (production). Defaults to `resend` if absent. |
| `RESEND_API_KEY` | Resend API key. Required when `EMAIL_PROVIDER=resend`. If absent (and not using SMTP), returns `503`. |
| `APP_URL` | Base URL of the dashboard / API. Used to construct the reset link. |
| `EMAIL_FROM` | *(Optional)* Sender address. Defaults to `Beech CMS <onboarding@resend.dev>`. |

**Responses**

| Status | Condition | Body |
|---|---|---|
| `200` | Always (email sent or email not found) | `{ "success": true }` |
| `400` | Missing or invalid email format | `{ "error": "Invalid request" }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests" }` |
| `503` | Neither SMTP nor Resend configured | `{ "error": "Service not available" }` |

---

## `POST /auth/reset-password`

Consumes a reset token and updates the user's password. **No authentication required.**

**Request**

```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "<plaintext_token_from_email_link>",
  "password": "new-secure-password",
  "locale": "it"
}
```

**Behaviour:**
- Looks up the SHA-256 digest of `token` in `password_reset_tokens`. Token must be unused (`used_at IS NULL`) and not expired.
- On success, performs three sequential operations:
  1. Marks the reset token as used (`passwordResetTokenRepository.markUsed`).
  2. Updates `users.password_hash` with a fresh bcrypt hash.
  3. Revokes all active refresh tokens for the user (`sessionRepository.revokeAllForUser`), terminating all active sessions.
- Dispatches a "password changed" security notification email via `waitUntil`.
- Password length must be 8–128 characters, and must not exceed 72 bytes UTF-8 encoded.
- Rate limited via Token Bucket: capacity 5, refill 0.1/s.

**Responses**

| Status | Condition | Body |
|---|---|---|
| `200` | Password updated successfully | `{ "success": true }` |
| `400` | Invalid/expired/used token, or password out of range / > 72 bytes | `{ "error": "..." }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests" }` |
| `503` | Neither SMTP nor Resend configured | `{ "error": "Service not available" }` |

**D1 table — `password_reset_tokens`:**

```sql
-- apps/api/migrations/0000_v040_base.sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
```
