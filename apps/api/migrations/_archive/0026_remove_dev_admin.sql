-- Remove the hardcoded development admin inserted by 0002_seed_admin.sql.
-- First-time admin creation is now handled via POST /auth/setup.
-- This migration is a no-op if the row was already manually deleted.
DELETE FROM users WHERE id = 'admin-seed-001';
