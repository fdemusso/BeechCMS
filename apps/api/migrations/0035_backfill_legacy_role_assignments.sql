-- Restore pre-RBAC account access.
-- Preserve already assigned RBAC scopes.
-- Bound accounts by SuperAdmin creation.
-- Second precision includes boundary accounts.
INSERT INTO roles (id, name, description, is_system, icon)
SELECT '512e0000-0000-4000-8000-000000000001', 'LegacyEditor', 'Legacy editor content access across all seeds.', 1, 'Pencil'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE id = '512e0000-0000-4000-8000-000000000001')
  AND EXISTS (SELECT 1 FROM users u WHERE u.role = 'editor' AND NOT EXISTS (SELECT 1 FROM user_role_assignments a WHERE a.user_id = u.id)
  AND u.created_at <= (SELECT created_at FROM roles WHERE name = 'SuperAdmin'));

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT id, 'content:read' FROM roles WHERE id = '512e0000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT id, 'content:create' FROM roles WHERE id = '512e0000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT id, 'content:update' FROM roles WHERE id = '512e0000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT id, 'content:delete' FROM roles WHERE id = '512e0000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-8' ||
        substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), u.id, r.id, '*'
FROM users u JOIN roles r ON r.name = 'SuperAdmin'
WHERE u.role = 'admin' AND NOT EXISTS (SELECT 1 FROM user_role_assignments a WHERE a.user_id = u.id)
  AND u.created_at <= (SELECT created_at FROM roles WHERE name = 'SuperAdmin');

INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-8' ||
        substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), u.id, r.id, '*'
FROM users u JOIN roles r ON r.id = '512e0000-0000-4000-8000-000000000001'
WHERE u.role = 'editor' AND NOT EXISTS (SELECT 1 FROM user_role_assignments a WHERE a.user_id = u.id)
  AND u.created_at <= (SELECT created_at FROM roles WHERE name = 'SuperAdmin');

