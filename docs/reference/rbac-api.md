# RBAC Administration API

JWT-authenticated endpoints for administering accounts, roles, scoped assignments and invitations.

- **Protected router**: mounted at `/api/rbac` under `apiProtected` (`apps/api/src/features/rbac/index.ts`).
- **Public router**: invitation preview/redemption, mounted at the root under `/auth/invitations/*` (`apps/api/src/features/rbac/public.ts`).

Every refusal is an RFC 7807 Problem Details document emitted through a single slice-wide emitter, so all errors share one shape. See [Error Model](/reference/error-model) for the envelope and [Roles & Permissions](/manage/roles-permissions) for the authorization model.

---

## Authorization Layers

Three checks apply, in order:

| Layer | Where | What it decides |
|---|---|---|
| Authentication | `authMiddleware` | Valid access JWT, active account |
| Coarse route gate | `permissionMiddleware` (`PROTECTED_ROUTES`) | Caller holds the required permission on **at least one** scope |
| Per-scope decision | The handler itself | `hasPermission()` / `canGrant()` / `canAdministerAccount()` on the **exact** target scope |

The coarse gate cannot be the final check: the scope of an administrative request lives in the **body** or in the **target's assignments**, never in the URL. The handler always re-decides.

**Route gate requirements**

| Route | Required (any scope) |
|---|---|
| `GET/POST /api/rbac/users`, `/users/:id`, `/users/:id/assignments`, `/users/:id/active` | `manage_users` |
| `POST/DELETE /api/rbac/assignments…` | `manage_users` |
| `GET/POST/DELETE /api/rbac/invitations…` | `manage_users` |
| `GET /api/rbac/roles` | `manage_users` or `manage_roles` |
| `POST/PUT/DELETE /api/rbac/roles…` | `manage_roles` |

**Not OAuth-reachable.** `OAUTH_SCOPE_ROUTES` does not list `/api/rbac/*` and `oauthScopeMiddleware()` is fail-closed, so an OAuth access token is refused `403 insufficient_scope` before reaching the slice.

**404 over 403.** When the caller holds administrative authority but not over *this* target, the answer is `404 not-found`, not `403`. A `403` would be an enumeration oracle for accounts, assignments and invitations outside the caller's perimeter.

---

## Error Codes

Frozen map (`apps/api/src/features/rbac/constants.ts`) — codes are never renamed once shipped, because the dashboard branches on them.

| Code | Status | Meaning |
|---|---|---|
| `invalid-json` | `400` | Body is not valid JSON |
| `validation-failed` | `422` | Body failed schema validation, or a malformed id |
| `not-found` | `404` | Target absent, or invisible to the caller (indistinguishable by design) |
| `forbidden` | `403` | Caller has administrative authority, but not on this scope |
| `escalation-refused` | `403` | The operation would hand out authority the caller does not hold |
| `email-taken` | `409` | Email already registered |
| `role-name-taken` | `409` | `roles.name` is UNIQUE and already used |
| `system-role-immutable` | `409` | System roles are seeded by migration, immutable at runtime |
| `last-global-admin` | `409` | Refused: would leave the platform with no active global administrator |
| `unknown-scope` | `422` | Scope is neither `*` nor the slug of an active seed |
| `email-unavailable` | `409` | No email provider configured, so no invitation can be delivered |
| `invitation-invalid` | `404` | Token unknown, expired or already redeemed (indistinguishable) |
| `invitation-revoked` | `409` | Issuer no longer holds the authority the invitation would grant |
| `invitation-already-used` | `409` | A consumed invitation cannot be regenerated |

---

## Accounts

### `GET /api/rbac/users`

Accounts the caller may administer, each with its **raw** (non-decayed) assignments. The caller's own account is always included.

Visibility is computed with `canAdministerAccount()`: a global `manage_users` holder sees everyone; a scoped holder sees an account only when they hold `manage_users` on **every** scope that account is assigned to. An account with no assignment at all is visible only to a global holder — zero-trust accounts stay out of a scoped manager's reach until deliberately assigned into their scope.

```json
{ "users": [ { "id": "…", "email": "…", "name": null, "surname": null,
               "role": "editor", "isActive": true, "assignments": [ … ] } ] }
```

### `POST /api/rbac/users`

Creates a **zero-trust** account: no role, no scope, no visibility until assigned. Any `manage_users` holder may create one; only assignment is scope-gated.

```http
POST /api/rbac/users
Content-Type: application/json

{ "email": "editor@example.com", "password": "…", "name": null, "surname": null }
```

| Field | Rule |
|---|---|
| `email` | trimmed, ≤ 254 chars, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, lowercased server-side |
| `password` | 8–128 chars **and** ≤ 72 bytes UTF-8 (bcrypt truncates past 72) |
| `name`, `surname` | optional/nullable, trimmed, ≤ 120 chars |

Accounts minted here always receive `users.role = 'editor'`, never `'admin'`. The developer/owner axis is not grantable through RBAC: `'admin'` is minted only by `POST /auth/setup`, so no RBAC path can produce an account that clears `requireAdmin()` and reaches `/api/seeds/*`.

| Status | Condition |
|---|---|
| `201` | Created — returns the full account view with `assignments: []` |
| `400` / `422` | `invalid-json` / `validation-failed` |
| `409` | `email-taken` (also the race backstop on the UNIQUE constraint) |

### `GET /api/rbac/users/:userId`

The account plus its assignments. Returns `404 not-found` for a malformed id, a missing account, **and** a target the caller may not administer.

### `PATCH /api/rbac/users/:userId/active`

Reversible deactivation.

```json
{ "isActive": false }
```

On deactivation every refresh token of the account is revoked in the same request, so the session dies with the flag instead of at the next refresh. The still-unexpired access JWT is already refused `403 account_disabled` by `permissionMiddleware()`.

**Last-admin guardrail.** Deactivation is refused `409 last-global-admin` when the target holds `manage_users` at `*` through a live assignment and no other active account can still administer the platform. The refusal applies to everyone, the holder included — there is no self-revocation escape hatch.

| Status | Body |
|---|---|
| `200` | `{ "id": "…", "isActive": false }` |
| `409` | `last-global-admin` |
| `404` | malformed id, unknown account, or not administrable |

---

## Roles

A role is a **global object with no scope of its own**. Authoring is therefore gated on `holdsAll()` — what the actor holds *anywhere*. The scope-precise anti-escalation rule stays `canGrant()`, applied at assignment time; minting a role is never, by itself, an escalation.

### `GET /api/rbac/roles`

The full catalogue, system roles included (they are assignable). Readable by `manage_users` **or** `manage_roles` holders, because the assignment UI needs the catalogue.

### `POST /api/rbac/roles`

```json
{
  "name": "Blog Editor",
  "description": "Writes and publishes on the blog seed.",
  "icon": "Pencil",
  "permissions": ["content:read", "content:create", "content:update"]
}
```

| Field | Rule |
|---|---|
| `name` | trimmed, 1–80 chars, UNIQUE |
| `description` | optional/nullable, ≤ 400 chars |
| `icon` | optional/nullable, ≤ 64 chars — lucide icon name rendered by the dashboard |
| `permissions` | **at least one**, each from the closed vocabulary; a role granting nothing is a footgun, not a use case |

| Status | Condition |
|---|---|
| `201` | `{ "id": "…" }` |
| `403` | `escalation-refused` — the role carries a permission the caller does not hold anywhere |
| `409` | `role-name-taken` |
| `422` | `validation-failed` (including an unknown permission) |

### `PUT /api/rbac/roles/:roleId`

Replaces `name`, `description`, `icon` and the **whole** permission set.

The actor must hold every permission in **both** the current and the incoming set: editing a role more powerful than yourself is escalation whichever direction it moves.

| Status | Condition |
|---|---|
| `200` | `{ "id": "…" }` |
| `403` | `escalation-refused` |
| `409` | `system-role-immutable` — `SuperAdmin` and any other `is_system` role |
| `409` | `last-global-admin` — the edit would strip `manage_users` from the role carrying the last global administrator |
| `404` | `not-found` |

### `DELETE /api/rbac/roles/:roleId`

Cascades to `role_permissions` and to every assignment and invitation referencing the role (FK `ON DELETE CASCADE`).

Same guards as the update: `holdsAll()` on the role's current permissions, `system-role-immutable`, and the last-admin guardrail (deletion is evaluated as "next permission set = `[]`"). Returns `204` on success.

---

## Assignments

The `(user, role, scope)` triple. `scope` is either `*` (global) or a `seeds.slug`.

### `GET /api/rbac/users/:userId/assignments`

Raw rows plus a derived `active` flag, the role name and the role's permissions:

```json
{ "assignments": [ { "id": "…", "userId": "…", "roleId": "…", "scope": "blog",
                     "active": true, "roleName": "Blog Editor",
                     "permissions": ["content:read", …] } ] }
```

An assignment naming a **deleted seed** still exists and stays visible and removable, even though it currently grants nothing (`active: false`). Decay is resolved at read time by a `LEFT JOIN` predicate, so the row is recoverable if the seed is restored.

### `POST /api/rbac/assignments`

The anti-escalation choke point. Two independent conditions must both hold:

1. `hasPermission(actor, 'manage_users', scope)` — the actor holds `manage_users` **on the target scope**. A seed-scoped actor targeting `*` is refused by construction, since a scoped grant never satisfies `*`.
2. `canGrant(actor, scope, role.permissions)` — every permission the role carries is already held by the actor at that scope.

```json
{ "userId": "…", "roleId": "…", "scope": "blog" }
```

`scope` must be `*` or the slug of an **active** seed, checked against the live registry (`getSeed`) — the same predicate the decay filter uses. Otherwise `422 unknown-scope`.

**Idempotent**: the repository does `INSERT OR IGNORE` + read-back, so re-posting an existing triple returns its existing id rather than a conflict.

| Status | Condition |
|---|---|
| `201` | `{ "id", "userId", "roleId", "scope" }` |
| `403` | `forbidden` (no `manage_users` on that scope) or `escalation-refused` (`canGrant` failed) |
| `404` | `not-found` — unknown account or unknown role |
| `422` | `validation-failed` (malformed id) or `unknown-scope` |

### `DELETE /api/rbac/assignments/:assignmentId`

Authorized on the assignment's **own** scope; `404` when the caller lacks authority there.

Refused `409 last-global-admin` when the assignment is at `*`, its role carries `manage_users`, and no other active account still administers the platform. `204` on success.

---

## Invitations

An invitation **is a deferred assignment**: it carries a pre-assigned `(role, scope)` pair and is subject to exactly the same two anti-escalation checks as `POST /api/rbac/assignments`.

- **TTL**: 72 hours.
- **Hash-only at rest**: the row stores `sha256hex(token)`; the plaintext exists once, inside the email.
- **No ghost account**: no `users` row is created at invite time. The account is materialised at redemption — which is why regeneration reuses the row instead of recreating anything.
- **One pending per email**: `invalidatePending()` runs before every issue.
- **Status is derived**, never stored: `used_at` set → `accepted`; unset and past `expires_at` → `expired`; otherwise `pending`.

Email delivery is required. With no `EMAIL_PROVIDER=smtp` and no `RESEND_API_KEY`, issuing and regenerating are refused `409 email-unavailable`. The link points at `${APP_URL}/admin/accept-invite?token=…`, and the send is dispatched via `executionCtx.waitUntil()` so it never blocks the response.

### `POST /api/rbac/invitations`

```json
{ "email": "newcomer@example.com", "roleId": "…", "scope": "blog", "locale": "it" }
```

`locale` selects the email language; anything unknown falls back to `en`.

| Status | Condition |
|---|---|
| `201` | `{ "id", "email", "roleId", "scope", "expiresAt" }` |
| `403` | `forbidden` / `escalation-refused` |
| `404` | `not-found` — unknown role |
| `409` | `email-taken` (the address already has an account) or `email-unavailable` |
| `422` | `validation-failed` / `unknown-scope` |

### `GET /api/rbac/invitations`

Scope-gated listing: a scoped `manage_users` holder never enumerates invitations outside their perimeter. Each row carries `roleName` and the derived `status`.

### `POST /api/rbac/invitations/:invitationId/regenerate`

Mints a fresh token, resets `expires_at` to now + 72 h and re-sends the email. Works on a `pending` **or** `expired` row.

Both authorization checks are re-run against the row's **own** `(role, scope)`: the caller regenerating may differ from the issuer, and the role's permissions may have changed since. Refused `409 invitation-already-used` on a consumed row.

### `DELETE /api/rbac/invitations/:invitationId`

Revokes the invitation. `404` (not `403`) when the caller lacks authority on the row's scope. `204` on success.

---

## Public Invitation Endpoints

An invitee has no account and therefore no JWT, so redemption cannot live under `apiProtected`. These two paths sit under `/auth/`, deliberately **not** under `/api/`: anything under `/api/` that is not in `PROTECTED_ROUTES` is refused by the fail-closed gate, and adding a public path to that table would weaken the table's meaning.

Both handlers rate-limit by client IP themselves (`acceptInvitation` limiter), returning `429` with `Retry-After`.

### `GET /auth/invitations/:token`

Renders "you were invited as X on Y" before asking for a password.

```json
{ "email": "newcomer@example.com", "roleName": "Blog Editor", "scope": "blog" }
```

`404 invitation-invalid` when the token is unknown, expired or already used — the three cases are deliberately indistinguishable.

### `POST /auth/invitations/accept`

```json
{ "token": "…", "password": "…", "name": null, "surname": null }
```

Redemption order, which is load-bearing:

1. Resolve the invitation by token hash; `404 invitation-invalid` if absent/expired/used.
2. Re-validate the scope against the live seed registry (`422 unknown-scope`).
3. **Re-evaluate the issuer's live authority** without a JWT — the issuer must still be active and must still pass `hasPermission` + `canGrant` for this `(role, scope)`. Otherwise `409 invitation-revoked`. Authority granted by an admin who has since been demoted or deactivated never lands.
4. `markUsed()` atomically — the invitation is consumed **before** the account exists, so a race cannot redeem it twice.
5. Create the account (`users.role = 'editor'`) and write the assignment.

No token and no session are returned: the activated account logs in through `POST /auth/login` like any other (`201 { id, email }`).

---

## See Also

- [Roles & Permissions](/manage/roles-permissions) — the permission vocabulary, scopes and system invariants.
- [Auth Endpoints](/reference/auth-endpoints) — login, refresh, setup, password reset.
- [Security Stack](/reference/security-stack) — JWT, refresh rotation, rate limiting.
- [Error Model](/reference/error-model) — the Problem Details envelope.
