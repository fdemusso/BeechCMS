# Roles & Permissions

BeechCMS authorization is **scoped RBAC**: a user holds one or more roles, each role is a bundle of atomic permissions, and each grant is bound to a perimeter — either a single seed or the whole platform.

The unit of authorization is the triple:

```
(user, role, scope)
```

For the HTTP contract of every endpoint described here, see the [RBAC Administration API](/reference/rbac-api).

---

## The Permission Vocabulary

The vocabulary is **closed by design**. It is defined once in `packages/core/src/rbac/permissions.ts` and enforced at rest by a `CHECK` constraint on `role_permissions`. Nothing at runtime — no API, no plugin, no dashboard screen — may extend it.

| Permission | Grants |
|---|---|
| `content:read` | Read entries within the scope |
| `content:create` | Create entries |
| `content:update` | Update entries — including **restoring** an entry from the Trash |
| `content:delete` | Delete entries — moving to the Trash, **erasing permanently**, and reconciling purges |
| `manage_users` | Administer accounts, assignments and invitations within the scope |
| `manage_roles` | Author roles (create, edit, delete) |
| `view_analytics` | See the analytics surface |

Adding a permission is a developer code change **plus** a migration widening the `CHECK` list — never a runtime write.

### What is deliberately absent

`manage_seeds`, or any schema-mutation permission, **does not exist and must never be added**. Seed schema mutation stays a developer capability exercised outside the dashboard, via CLI and migrations. Making the permission unrepresentable at rest is the strongest guarantee available.

This is the **developer/owner axis**, tracked separately on `users.role`:

- `'admin'` — the Developer / instance owner. Minted **only** by `POST /auth/setup`.
- `'editor'` — a standard Beech user whose authority is managed entirely through RBAC. (The name is legacy, kept for `CHECK`-constraint compatibility.)

Every account minted through the RBAC API receives `'editor'`, so no RBAC path can produce an account that clears `requireAdmin()` and reaches `/api/seeds/*`.

### One surface, one permission

Each non-CRUD dashboard surface owns one dedicated permission (`view_analytics` being the first). Absence of the permission hides the surface. There is no default-visible exception.

### The Trash reuses the CRUD vocabulary

The [Trash](/features/trash) introduces no new permission. Its routes map onto the existing verbs, scoped to the Seed slug:

| Route | Requirement |
|---|---|
| `GET /api/content/{slug}/trash` | `content:read` on `{slug}` |
| `POST /api/content/{slug}/{id}/restore` | `content:update` on `{slug}` |
| `POST /api/content/{slug}/trash/bulk-restore` | `content:update` on `{slug}` |
| `DELETE /api/content/{slug}/{id}` (soft delete or `?purge=true`) | `content:delete` on `{slug}` |
| `POST /api/content/{slug}/trash/bulk-purge` | `content:delete` on `{slug}` |
| `POST /api/content/{slug}/trash/reconcile` | `content:delete` on `{slug}` |

Restoring is an update, not a delete: a holder of `content:read` + `content:update` can pull an entry back out of the Trash but can neither put it there nor erase it. In the dashboard, actions the caller cannot perform render **disabled**, never hidden-and-clickable — and the server gate is the real enforcement.

---

## Scopes

A scope is a permission perimeter: either the sentinel `*` or a `seeds.slug`. Isolation is **per-seed, never row-level**.

| Scope | Meaning |
|---|---|
| `*` | Grants across every seed, present *and future*. Reserved for cross-cutting coordination roles. |
| `blog`, `products`, … | Grants only within that seed. |

### The asymmetry that blocks escalation

A **global** grant satisfies any scope. A **scoped** grant satisfies only its own seed and **never** `*`.

That asymmetry is the whole defence against horizontal escalation: a manager scoped to `blog` can never mint a global assignment, and can never hand out a permission absent from their own set on that scope — regardless of what the role itself contains.

### Additive model

Effective authority is the union of every active assignment. Assignments can only widen the result; an assignment referencing an unknown role is ignored rather than treated as an error.

### Scope decay

`user_role_assignments.scope` has **no foreign key** to `seeds` — the `*` sentinel is not a slug. When a seed is deleted, assignments naming it *decay*: they are filtered out at read time by a `LEFT JOIN` predicate, so they grant nothing while remaining visible and removable in the UI, and they come back to life if the seed is restored.

---

## Roles

A role is a reusable, runtime-composable named bundle of permissions. It is a **global object with no scope of its own** — the scope is chosen at assignment time.

Roles carry an optional `icon` (a lucide icon name) rendered by the dashboard alongside the name and a permission-badge list.

### System roles

`SuperAdmin` is seeded by migration `0000_v040_base.sql` with the full permission set and `is_system = 1`. It is **immutable at runtime**: any attempt to edit or delete it is refused `409 system-role-immutable`. Its id is minted per database, so nothing may hardcode it — `roles.name` is UNIQUE and is the stable handle.

On a fresh database there is no account to backfill; `SuperAdmin` is granted to the first account on the `POST /auth/setup` path.

---

## The Two Authorization Primitives

Every decision in the system resolves to one of two questions.

**`hasPermission(actor, permission, scope)` — "may this caller do X *here*?"**
True when the actor holds the permission globally, or holds it on that specific seed. A scoped grant never satisfies `*`.

**`canGrant(actor, targetScope, targetPermissions)` — "may this caller hand out this authority?"**
True only when the actor already holds **every** permission being granted, **at the scope it is being granted on**. This is the anti-escalation rule.

Two helpers exist but are **not** authorization primitives:

- `permissionsHeldAnywhere()` — everything the actor holds at any scope. Answers *"could this actor ever grant X somewhere"*, used to gate role **authoring** (a role has no scope, so there is no scope to check against).
- `hasPermissionAnywhere()` — backs the **coarse route gate** for administration endpoints whose scope is not in the URL. It keeps out callers with no administrative authority at all; the slice behind it must still make the exact per-scope decision.

Neither may ever be the final check on a route.

---

## Administering Accounts

Account visibility and administration use `canAdministerAccount()`:

- A **global** `manage_users` holder may administer anyone.
- A **scoped** holder may administer an account only when they hold `manage_users` on **every** scope that account is assigned to. Administration — deactivation above all — is total, so partial authority over a target is never enough.
- An account with **no assignment at all** is administrable only by a global holder. This keeps freshly created zero-trust accounts out of a scoped manager's reach until they are deliberately assigned into that scope.

Accounts are created **zero-trust**: no role, no scope, no visibility until someone assigns them. Any `manage_users` holder may create an account; only *assignment* is scope-gated.

### Deactivation, not deletion

Accounts are deactivated, reversibly. On deactivation every refresh token is revoked in the same request, so the session dies with the flag rather than at the next refresh; the still-unexpired access JWT is refused `403 account_disabled`.

---

## System Invariants

### Last global administrator

The platform may never be left without an active account able to administer it. Three paths are guarded, all refusing `409 last-global-admin`:

| Action | Refused when |
|---|---|
| Deactivating an account | It holds `manage_users` at `*` and no other active account does |
| Editing a role | The edit strips `manage_users` from a role assigned at `*` and no other role still carries an active global admin |
| Deleting a role or a `*` assignment | Same question, evaluated as "next permission set = `[]`" |

The refusal applies to **everyone, the holder included** — there is no self-revocation escape hatch.

### Role authoring never exceeds the author

Nobody may mint, edit or delete a role carrying authority they do not hold. On edit, the actor must hold every permission in **both** the current and the incoming set: editing a role more powerful than yourself is escalation whichever direction it moves.

### Refusals do not leak existence

When a caller holds administrative authority but not over *this* target, the answer is `404`, never `403`. A `403` would turn every administration endpoint into an enumeration oracle for accounts, assignments and invitations outside the caller's perimeter.

Likewise, an invitation token that is unknown, expired or already redeemed produces one indistinguishable `404`.

---

## Invitation-Based Onboarding

An invitation **is a deferred assignment**, subject to exactly the same anti-escalation checks as a direct one.

```
 issue ──► email (72 h link) ──► preview ──► accept ──► account + assignment
   │                                                         ▲
   └──► regenerate (pending or expired) ─────────────────────┘
   └──► revoke
```

- The row carries the pre-assigned `(role, scope)` and the **issuer id**, which is load-bearing, not an audit field.
- Only the SHA-256 hash of the token is stored. The plaintext exists once, inside the email.
- No `users` row exists before redemption — which is why regeneration reuses the row rather than recreating a ghost account.
- One pending invitation per email address; issuing a new one invalidates the previous.
- Status is derived, never stored: `pending`, `expired` (regenerable), `accepted`.

**Authority is re-checked at redemption.** Before the account is created, the issuer must still be active and must still pass `hasPermission` + `canGrant` for that `(role, scope)`. Authority granted by an admin who has since been demoted or deactivated never lands — the invitee gets `409 invitation-revoked`.

The invitation is consumed **before** the account is created, atomically, so a race cannot redeem one token twice. Redemption returns no session: the activated account logs in through `POST /auth/login` like any other.

Issuing requires a configured email provider (`EMAIL_PROVIDER=smtp` or `RESEND_API_KEY`); otherwise the request is refused `409 email-unavailable` rather than silently creating an undeliverable invitation.

---

## In the Dashboard

Everything above is administered from **Settings → Access**, a sidebar group holding three tabs. Each is rendered only when the caller holds the matching permission *somewhere*:

| Tab | Icon | Visible when |
|---|---|---|
| **Users** | `Users` | `manage_users` on any scope |
| **Roles** | `ShieldCheck` | `manage_users` **or** `manage_roles` on any scope |
| **Invitations** | `Mailbox` | `manage_users` on any scope |

Visibility comes from `usePermissions()`, which rehydrates the `permissions` payload of `GET /api/settings/me` and calls **the same `@beechcms/core` evaluator** `permissionMiddleware()` calls — the UI never re-implements the scope model. Hiding is cosmetic; the server gate stays the enforcement point. With no payload the hook falls back to zero authority, so every gated surface disappears.

The **Data Models** group (Seed Builder) is gated on `isDeveloper` (`users.role === 'admin'`) instead — it is the developer axis, not a permission.

### Users tab

A table of every administrable account: email, name, role badges, and actions. The caller's own row is sorted first and tagged **You**.

- **Create account** opens a form (email, password, name, surname) that states up front that the account starts with no role and no access. Accounts with no assignment render as *No access*.
- The **roles** action opens the assignments dialog: existing `(role, scope)` rows with their permission badges, plus a role picker and a scope picker to add a new one. An assignment whose seed no longer exists is flagged **Inactive scope** and stays removable.
- The **active** switch deactivates an account. It is disabled for your own row and for the Developer account, and a `last-global-admin` refusal surfaces as a toast.
- The Developer's `SuperAdmin` assignment cannot be removed from this dialog.

### Roles tab

Name (with its icon), description, permission badges, and edit/delete actions — the actions column only renders for `manage_roles` holders.

The role form offers a searchable **lucide icon picker** and permission checkboxes split into **Content** and **System** groups. Permissions you do not hold anywhere (`permissionsHeldAnywhere`) are disabled, so the form cannot submit an escalation. System roles have edit and delete permanently disabled, and deletion warns that every assignment through the role is cascaded away.

### Invitations tab

Email, role, scope, derived status badge, relative expiry, and per-row regenerate/revoke actions. Regenerate is hidden once a row is `accepted`.

The invite dialog pairs an email with the same role + scope pickers as an assignment. The submit button is **pre-emptively disabled** when the selected role carries a permission you lack on the selected scope, with the escalation reason in a tooltip — the server still refuses independently.

### The scope picker

Options come from `manageableScopes` on `GET /api/settings/me` — the server's own answer to *"what may this caller grant on"*. They deliberately do **not** come from `GET /api/schema`, which is filtered by `content:read`: a `manage_users` holder need not be able to read the seeds they administer. Labels are enriched from the schema when the seed happens to be visible, and fall back to the raw slug otherwise. `*` renders as **All seeds (global)**.

### The invitee's screen

`/admin/accept-invite?token=…` previews the invitation (`GET /auth/invitations/:token`) and renders "you were invited as *Role* on *Scope*" before asking for a password, with a strength indicator and confirmation field. An unknown, expired or already-redeemed token shows one indistinguishable "invalid or expired" card. On success the invitee is redirected to the login page — redemption issues no session.

---

## Configuration

Invitations require a working email provider; without one, issuing and regenerating are refused `email-unavailable`. Direct account creation needs no email at all.

| Variable | Notes |
|---|---|
| `EMAIL_PROVIDER` | `smtp` (local dev via Mailpit) or `resend` (production). Defaults to `resend` when absent. |
| `RESEND_API_KEY` | Required when the provider is `resend`. |
| `SMTP_HOST` / `SMTP_PORT` | Mailpit host and HTTP API port locally — `localhost` / `8025`. |
| `EMAIL_FROM` | Sender address. |
| `APP_URL` | Base URL used to build the `${APP_URL}/admin/accept-invite?token=…` link. Falls back to the request origin. |

---

## See Also

- [RBAC Administration API](/reference/rbac-api) — endpoint-by-endpoint contract.
- [Your First Project](/start/first-project) — the onboarding walkthrough, end to end.
- [Security Stack](/reference/security-stack) — JWT, refresh rotation, rate limiting.
- [Environments](/manage/environments)
