-- =============================================================================
-- RBAC — user activation, roles/permissions/assignments, invitations
--
-- Forward migration. These objects were previously appended in place to
-- 0000_v040_base.sql, which had already been applied on released databases
-- (v0.8.0 shipped 0000 + 0030 with none of this). Wrangler tracks applied
-- migrations by file name, so an upgrading instance never re-ran 0000 and
-- never got these objects. Moved here per _config/database_workflow.md
-- ("Never edit an already-applied migration file").
-- =============================================================================


-- =============================================================================
-- USERS — reversible deactivation (brief §4: no hard-delete split in this
-- iteration).
-- =============================================================================

ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);


-- =============================================================================
-- RBAC — ROLES, PERMISSIONS, ASSIGNMENTS
--
--     Runtime-composable roles over a CLOSED atomic permission vocabulary,
--     applied through (user, role, scope) triples. Scope is either '*' or a
--     seeds.slug: isolation is per-seed, never row-level.
--
--     `manage_seeds` is deliberately ABSENT from the role_permissions CHECK
--     list. Schema mutation stays a developer-only, out-of-dashboard
--     capability; making the permission unrepresentable at rest is the
--     strongest guarantee available.
-- =============================================================================

-- Reusable, runtime-composable named permission bundles.
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT    NOT NULL PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    icon        TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The closed atomic vocabulary, enforced at rest.
-- Extending this CHECK list is a developer-only schema edit, never a runtime write.
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN (
                   'content:read',
                   'content:create',
                   'content:update',
                   'content:delete',
                   'manage_users',
                   'manage_roles',
                   'view_analytics'
               )),
    PRIMARY KEY (role_id, permission)
);

-- The (user, role, scope) triple.
-- `scope` is either '*' (global) or a seeds.slug. No FK to seeds(slug): the '*'
-- sentinel is not a slug. Decay of scopes pointing at a deleted or missing seed
-- is resolved at READ time by a LEFT JOIN predicate, which keeps the row
-- recoverable if the seed is restored.
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id         TEXT    NOT NULL PRIMARY KEY,
    user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    TEXT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope      TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (user_id, role_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_ura_user  ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ura_role  ON user_role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_ura_scope ON user_role_assignments(scope);

-- SYSTEM ROLE SEED
--    Static data, seeded exactly like the `oauth_clients` rows in 0000.
--    No user exists yet on a fresh database, so there is nothing to
--    backfill: granting SuperAdmin to the first account is runtime work on the
--    `POST /auth/setup` path, owned by the enforcement sprint.
--
--    Ids are RFC 4122 v4-shaped, matching `SystemIdGenerator.uuid()`
--    (`packages/core/src/common/id-generator.ts`). `IIdGenerator.isValid()` is the
--    ONLY id-format authority in the codebase and later sprints will run route
--    params through it, so a migration must not mint a differently shaped id.
--    `roles.name` is UNIQUE, so `INSERT OR IGNORE` keeps the seed idempotent and
--    every downstream statement resolves the id by name rather than assuming it.
INSERT OR IGNORE INTO roles (id, name, description, is_system, icon)
VALUES (
    lower(
        hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) ||
        substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
    ),
    'SuperAdmin',
    'Full platform control across every scope. Cannot manage schema.',
    1,
    'Shield'
);

-- One INSERT OR IGNORE per permission, not a 7-way UNION ALL CROSS JOIN: D1's SQLite backend
-- caps compound SELECT terms (SQLITE_LIMIT_COMPOUND_SELECT) and rejects the 7-term form with
-- "too many terms in compound SELECT". Identical end state, no compound SELECT.
INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:read' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:create' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:update' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:delete' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_users' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_roles' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'view_analytics' FROM roles r WHERE r.name = 'SuperAdmin';


-- =============================================================================
-- RBAC — INVITATIONS
--
--     Single-use, expiring onboarding tokens carrying a PRE-ASSIGNED (role, scope)
--     pair. Hash-only at rest, exactly like password_reset_tokens and oauth_tokens:
--     the plaintext exists once, inside the email that carries it.
--
--     No `users` row is created at invite time. The account is materialised at
--     redemption, which is why regeneration (brief §4) reuses this row and never
--     "recreates the account": the pre-assignment lives HERE, not on a ghost user.
--
--     Status is derived, not stored:
--       used_at IS NOT NULL          -> accepted
--       used_at IS NULL AND expired  -> expired (regenerable)
--       otherwise                    -> pending
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
    id          TEXT    NOT NULL PRIMARY KEY,
    -- Lowercased at the handler boundary, like users.email. NOT UNIQUE: an accepted
    -- or revoked invite may legitimately be followed by another one for the same
    -- address. One-pending-per-email is enforced by invalidatePending(), mirroring
    -- IPasswordResetTokenRepository.
    email       TEXT    NOT NULL,
    token_hash  TEXT    NOT NULL,
    -- The pre-assignment. ON DELETE CASCADE: deleting the role destroys every
    -- invitation that would have granted it, which is the same guarantee
    -- user_role_assignments already gives.
    role_id     TEXT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    -- '*' or a seeds.slug. No FK, for the same reason as user_role_assignments:
    -- the '*' sentinel is not a slug. Validity is re-checked at redemption.
    scope       TEXT    NOT NULL,
    -- The issuer. Their LIVE authority is re-evaluated at redemption, so this is a
    -- load-bearing column, not an audit field.
    invited_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_invitations_hash  ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_role  ON invitations(role_id);
