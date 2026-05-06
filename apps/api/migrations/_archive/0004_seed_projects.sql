-- Migration 0003: Seed Projects - Dati di esempio per testare tutti i tipi di Branch
-- Inserisce 5 progetti con tutti i tipi di campo: text, number, boolean, date, json

INSERT INTO content_entries (id, schema_slug, data, created_at, updated_at) VALUES
-- Progetto 1: Tutti i campi popolati - Tags con colori blu/cyan/viola
('550e8400-e29b-41d4-a716-446655440001', 'progetti', '{"br_01":"Beech CMS","br_02":"Sistema di gestione contenuti modulare e schema-driven","br_03":156000,"br_04":75.5,"br_05":true,"br_06":true,"br_07":"2024-01-15","br_08":"2024-12-31","br_09":"{\"client\":\"Acme Corp\",\"priority\":\"high\",\"team\":[\"Mario\",\"Luigi\"]}","br_10":"{\"cms\":\"#3b82f6\",\"react\":\"#06b6d4\",\"cloudflare\":\"#f97316\"}"}', 1705276800, 1705276800),

-- Progetto 2: Mix di valori - Tags con colori rosa/verde/giallo
('550e8400-e29b-41d4-a716-446655440002', 'progetti', '{"br_01":"Beech Studio","br_02":"Applicazione web per gestione progetti creativi","br_03":450000,"br_04":33.3,"br_05":true,"br_06":false,"br_07":"2024-03-01","br_08":"2025-06-30","br_09":"{\"client\":\"Studio X\",\"priority\":\"medium\"}","br_10":"{\"design\":\"#ec4899\",\"web\":\"#10b981\",\"mobile\":\"#f59e0b\"}"}', 1709251200, 1709251200),

-- Progetto 3: Progetto inattivo - Tags con colori viola/lime
('550e8400-e29b-41d4-a716-446655440003', 'progetti', '{"br_01":"Beech Website","br_02":"Sito istituzionale aziendale con landing pages","br_03":89000,"br_04":100,"br_05":false,"br_06":true,"br_07":"2023-06-15","br_08":"2023-12-20","br_09":"{\"client\":\"BeechCo\",\"priority\":\"low\"}","br_10":"{\"website\":\"#8b5cf6\",\"landing\":\"#84cc16\"}"}', 1686787200, 1702944000),

-- Progetto 4: Appena iniziato (0%) - Tags con colori rosso/giallo/indaco
('550e8400-e29b-41d4-a716-446655440004', 'progetti', '{"br_01":"E-commerce Platform","br_02":"Piattaforma completa per vendita online multi-tenant","br_03":1250000,"br_04":0,"br_05":true,"br_06":false,"br_07":"2026-02-01","br_08":"2027-01-31","br_09":"{\"client\":\"ShopCo\",\"priority\":\"high\",\"technologies\":[\"Next.js\",\"Stripe\"]}","br_10":"{\"e-commerce\":\"#ef4444\",\"payments\":\"#eab308\",\"saas\":\"#6366f1\"}"}', 1738368000, 1738368000),

-- Progetto 5: Grande progetto con JSON complesso - Tags con colori viola/verde/rosa
('550e8400-e29b-41d4-a716-446655440005', 'progetti', '{"br_01":"Mobile App","br_02":"Applicazione mobile iOS/Android per tracciamento fitness","br_03":680000,"br_04":42.8,"br_05":true,"br_06":false,"br_07":"2024-09-01","br_08":"2025-03-31","br_09":"{\"client\":\"FitTech Inc\",\"priority\":\"high\",\"platforms\":[\"iOS\",\"Android\"],\"features\":[\"tracking\",\"gamification\",\"social\"]}","br_10":"{\"mobile\":\"#a855f7\",\"fitness\":\"#22c55e\",\"react-native\":\"#f472b6\"}"}', 1725148800, 1725148800);
