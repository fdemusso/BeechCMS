-- Adds `manage_layout` to the closed permission vocabulary.
--
-- SQLite cannot alter a CHECK constraint, so `role_permissions` is rebuilt with the table-copy
-- pattern. Nothing references `role_permissions`, so dropping it trips no foreign key.
-- `manage_seeds` stays absent from the CHECK on purpose.

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
                   'manage_layout'
               )),
    PRIMARY KEY (role_id, permission)
);

INSERT INTO role_permissions_dg_tmp (role_id, permission)
SELECT role_id, permission FROM role_permissions;

DROP TABLE role_permissions;

ALTER TABLE role_permissions_dg_tmp RENAME TO role_permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_layout' FROM roles r WHERE r.name = 'SuperAdmin';
