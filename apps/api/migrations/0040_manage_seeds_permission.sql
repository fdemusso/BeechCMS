-- Adds `manage_seeds` to the closed permission vocabulary.
--
-- SQLite cannot alter a CHECK constraint, so `role_permissions` is rebuilt with the table-copy
-- pattern. Nothing references `role_permissions`, so dropping it trips no foreign key.
-- This migration deliberately revokes the exclusion that 0032 and 0039 recorded (brief rule 29).

CREATE TABLE IF NOT EXISTS role_permissions_dg_tmp (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN (
                   'content:read',
                   'content:create',
                   'content:update',
                   'content:delete',
                   'manage_users',
                   'manage_roles',
                   'view_analytics',
                   'manage_layout',
                   'manage_seeds'
               )),
    PRIMARY KEY (role_id, permission)
);

INSERT INTO role_permissions_dg_tmp (role_id, permission)
SELECT role_id, permission FROM role_permissions;

DROP TABLE role_permissions;

ALTER TABLE role_permissions_dg_tmp RENAME TO role_permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_seeds' FROM roles r WHERE r.name = 'SuperAdmin';
