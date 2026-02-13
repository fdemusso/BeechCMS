-- Utente admin di test per sviluppo
-- Email: admin@beech.local
-- Password: password123
INSERT OR IGNORE INTO users (id, email, password_hash, role)
VALUES (
  'admin-seed-001',
  'admin@beech.local',
  '$2a$10$L28S3Fy29jhsCE40e/eMu.0BBj6bkMvHsT0yvZAh9weGiGko1jAf2',
  'admin'
);
