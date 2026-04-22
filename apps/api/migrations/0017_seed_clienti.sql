-- Migration 0017: Seed "clienti" — demo data for Branch.policies
--
-- Schema slug : clienti  (CLIENTE_SEED)
-- Branch IDs  : clt_01…clt_08
--
-- Policy coverage per record:
--   clt_02 (email)        → visibility:masked, search:false, public:false
--   clt_03 (passwordHash) → privacy:hash stored as sha256hex, visibility:hidden, all other: false
--   clt_05 (phone)        → visibility:masked, filter:false, public:false
--   clt_06 (internalNote) → visibility:hidden, search:false, public:false
--   clt_07 (registeredAt) → public:false
--
-- sha256 values used (pre-hashed, as the API would store them after applyPrivacy):
--   "password"  → 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
--   "123456"    → 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
--   "letmein"   → 1c8bfe8f801d79745c4631d09fff36c82aa37fc4cce4fc946683d7b336b63032
--   "abc123"    → 6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090
--   "qwerty"    → 65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5

INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES

-- Cliente 1: piano enterprise, attivo — tutti i campi policy popolati
('clt-0001', 'clienti', 'marco-rossi', 'published',
 json_object(
   'clt_01', 'Marco Rossi',
   'clt_02', 'marco.rossi@acmecorp.it',
   'clt_03', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
   'clt_04', 'enterprise',
   'clt_05', '+39 02 1234 5678',
   'clt_06', 'Cliente storico. Sconto applicato del 20% su rinnovo annuale.',
   'clt_07', '2024-03-15',
   'clt_08', 1
 ),
 unixepoch(), unixepoch()),

-- Cliente 2: piano pro, attivo
('clt-0002', 'clienti', 'laura-bianchi', 'published',
 json_object(
   'clt_01', 'Laura Bianchi',
   'clt_02', 'laura.bianchi@studiox.io',
   'clt_03', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
   'clt_04', 'pro',
   'clt_05', '+39 06 9876 5432',
   'clt_06', 'Contattare prima del rinnovo per upsell a enterprise.',
   'clt_07', '2025-01-08',
   'clt_08', 1
 ),
 unixepoch(), unixepoch()),

-- Cliente 3: piano starter, attivo
('clt-0003', 'clienti', 'davide-ferrari', 'published',
 json_object(
   'clt_01', 'Davide Ferrari',
   'clt_02', 'davide@mediahub.eu',
   'clt_03', '1c8bfe8f801d79745c4631d09fff36c82aa37fc4cce4fc946683d7b336b63032',
   'clt_04', 'starter',
   'clt_05', '+39 011 4567 890',
   'clt_06', 'Ha richiesto supporto per migrazione da WordPress.',
   'clt_07', '2025-06-22',
   'clt_08', 1
 ),
 unixepoch(), unixepoch()),

-- Cliente 4: piano free, non attivo — dimostra active:false
('clt-0004', 'clienti', 'giulia-verdi', 'published',
 json_object(
   'clt_01', 'Giulia Verdi',
   'clt_02', 'giulia.verdi@personal.me',
   'clt_03', '6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090',
   'clt_04', 'free',
   'clt_05', '+39 081 3210 987',
   'clt_06', 'Account free scaduto. Inviare offerta upgrade.',
   'clt_07', '2025-09-01',
   'clt_08', 0
 ),
 unixepoch(), unixepoch()),

-- Cliente 5: piano pro, attivo — phone e internalNote volutamente NULL per testare null safety
('clt-0005', 'clienti', 'sofia-costa', 'published',
 json_object(
   'clt_01', 'Sofia Costa',
   'clt_02', 'sofia.costa@fittech.com',
   'clt_03', '65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5',
   'clt_04', 'pro',
   'clt_05', null,
   'clt_06', null,
   'clt_07', '2026-01-30',
   'clt_08', 1
 ),
 unixepoch(), unixepoch());
