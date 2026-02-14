-- Migration 0003 UPDATE: Progetti con tags formato {tag: colore}
-- Dataset esteso (25 progetti) per testare paginazione e funzionalità tabella

DELETE FROM content_entries WHERE schema_slug = 'progetti';

INSERT INTO content_entries (id, schema_slug, data, created_at, updated_at) VALUES
-- Progetto 1
('550e8400-e29b-41d4-a716-446655440001', 'progetti', '{"br_01":"Beech CMS","br_02":"Sistema di gestione contenuti modulare e schema-driven","br_03":156000,"br_04":75.5,"br_05":true,"br_06":true,"br_07":"2024-01-15","br_08":"2024-12-31","br_09":"{\"client\":\"Acme Corp\",\"priority\":\"high\",\"team\":[\"Mario\",\"Luigi\"]}","br_10":"{\"cms\":\"#3b82f6\",\"react\":\"#06b6d4\",\"cloudflare\":\"#f97316\"}"}', 1705276800, 1705276800),
-- Progetto 2
('550e8400-e29b-41d4-a716-446655440002', 'progetti', '{"br_01":"Beech Studio","br_02":"Applicazione web per gestione progetti creativi","br_03":450000,"br_04":33.3,"br_05":true,"br_06":false,"br_07":"2024-03-01","br_08":"2025-06-30","br_09":"{\"client\":\"Studio X\",\"priority\":\"medium\"}","br_10":"{\"design\":\"#ec4899\",\"web\":\"#10b981\",\"mobile\":\"#f59e0b\"}"}', 1709251200, 1709251200),
-- Progetto 3
('550e8400-e29b-41d4-a716-446655440003', 'progetti', '{"br_01":"Beech Website","br_02":"Sito istituzionale aziendale con landing pages","br_03":89000,"br_04":100,"br_05":false,"br_06":true,"br_07":"2023-06-15","br_08":"2023-12-20","br_09":"{\"client\":\"BeechCo\",\"priority\":\"low\"}","br_10":"{\"website\":\"#8b5cf6\",\"landing\":\"#84cc16\"}"}', 1686787200, 1702944000),
-- Progetto 4
('550e8400-e29b-41d4-a716-446655440004', 'progetti', '{"br_01":"E-commerce Platform","br_02":"Piattaforma completa per vendita online multi-tenant","br_03":1250000,"br_04":0,"br_05":true,"br_06":false,"br_07":"2026-02-01","br_08":"2027-01-31","br_09":"{\"client\":\"ShopCo\",\"priority\":\"high\",\"technologies\":[\"Next.js\",\"Stripe\"]}","br_10":"{\"e-commerce\":\"#ef4444\",\"payments\":\"#eab308\",\"saas\":\"#6366f1\"}"}', 1738368000, 1738368000),
-- Progetto 5
('550e8400-e29b-41d4-a716-446655440005', 'progetti', '{"br_01":"Mobile App","br_02":"Applicazione mobile iOS/Android per tracciamento fitness","br_03":680000,"br_04":42.8,"br_05":true,"br_06":false,"br_07":"2024-09-01","br_08":"2025-03-31","br_09":"{\"client\":\"FitTech Inc\",\"priority\":\"high\",\"platforms\":[\"iOS\",\"Android\"],\"features\":[\"tracking\",\"gamification\",\"social\"]}","br_10":"{\"mobile\":\"#a855f7\",\"fitness\":\"#22c55e\",\"react-native\":\"#f472b6\"}"}', 1725148800, 1725148800),
-- Progetto 6
('550e8400-e29b-41d4-a716-446655440006', 'progetti', '{"br_01":"Portale B2B","br_02":"Portale aziendale per ordini e gestione fornitori","br_03":320000,"br_04":88,"br_05":true,"br_06":true,"br_07":"2024-02-10","br_08":"2025-02-28","br_09":"{\"client\":\"LogiCorp\",\"priority\":\"high\"}","br_10":"{\"b2b\":\"#0ea5e9\",\"portal\":\"#14b8a6\",\"enterprise\":\"#64748b\"}"}', 1707523200, 1735689600),
-- Progetto 7
('550e8400-e29b-41d4-a716-446655440007', 'progetti', '{"br_01":"Dashboard Analytics","br_02":"Dashboard real-time per metriche di business e KPI","br_03":185000,"br_04":100,"br_05":true,"br_06":true,"br_07":"2023-11-01","br_08":"2024-05-15","br_09":"{\"client\":\"DataFlow\",\"priority\":\"medium\"}","br_10":"{\"analytics\":\"#8b5cf6\",\"charts\":\"#06b6d4\",\"real-time\":\"#22c55e\"}"}', 1698796800, 1715731200),
-- Progetto 8
('550e8400-e29b-41d4-a716-446655440008', 'progetti', '{"br_01":"Blog Redesign","br_02":"Restyling completo del blog aziendale con nuovo CMS","br_03":45000,"br_04":65,"br_05":true,"br_06":false,"br_07":"2024-07-01","br_08":"2024-12-15","br_09":"{\"client\":\"MediaHub\",\"priority\":\"low\"}","br_10":"{\"blog\":\"#f59e0b\",\"cms\":\"#3b82f6\",\"design\":\"#ec4899\"}"}', 1719792000, 1734048000),
-- Progetto 9
('550e8400-e29b-41d4-a716-446655440009', 'progetti', '{"br_01":"API Gateway","br_02":"Gateway centralizzato per microservizi con rate limiting","br_03":220000,"br_04":55,"br_05":true,"br_06":false,"br_07":"2024-05-15","br_08":"2025-08-30","br_09":"{\"client\":\"TechScale\",\"priority\":\"high\"}","br_10":"{\"api\":\"#6366f1\",\"microservices\":\"#a855f7\",\"gateway\":\"#0ea5e9\"}"}', 1715731200, 1725148800),
-- Progetto 10
('550e8400-e29b-41d4-a716-446655440010', 'progetti', '{"br_01":"Intranet Aziendale","br_02":"Portale interno per documenti e comunicazioni","br_03":95000,"br_04":92,"br_05":true,"br_06":true,"br_07":"2023-09-01","br_08":"2024-06-30","br_09":"{\"client\":\"BigCorp\",\"priority\":\"medium\"}","br_10":"{\"intranet\":\"#64748b\",\"documents\":\"#14b8a6\",\"internal\":\"#f97316\"}"}', 1693526400, 1719792000),
-- Progetto 11
('550e8400-e29b-41d4-a716-446655440011', 'progetti', '{"br_01":"App Prenotazioni","br_02":"App per prenotazione ristoranti e gestione tavoli","br_03":78000,"br_04":28,"br_05":true,"br_06":false,"br_07":"2024-10-01","br_08":"2025-04-30","br_09":"{\"client\":\"RestoApp\",\"priority\":\"medium\"}","br_10":"{\"booking\":\"#22c55e\",\"restaurant\":\"#ef4444\",\"mobile\":\"#a855f7\"}"}', 1727740800, 1735689600),
-- Progetto 12
('550e8400-e29b-41d4-a716-446655440012', 'progetti', '{"br_01":"Marketplace NFT","br_02":"Piattaforma per acquisto e vendita di NFT con wallet integrato","br_03":890000,"br_04":15,"br_05":true,"br_06":false,"br_07":"2025-01-15","br_08":"2026-01-31","br_09":"{\"client\":\"CryptoArt\",\"priority\":\"high\"}","br_10":"{\"nft\":\"#f59e0b\",\"blockchain\":\"#6366f1\",\"web3\":\"#22c55e\"}"}', 1736899200, 1736899200),
-- Progetto 13
('550e8400-e29b-41d4-a716-446655440013', 'progetti', '{"br_01":"Sistema Ticketing","br_02":"Sistema di gestione ticket e supporto clienti","br_03":125000,"br_04":78,"br_05":true,"br_06":true,"br_07":"2024-01-20","br_08":"2024-11-30","br_09":"{\"client\":\"SupportPro\",\"priority\":\"high\"}","br_10":"{\"ticketing\":\"#0ea5e9\",\"support\":\"#14b8a6\",\"helpdesk\":\"#64748b\"}"}', 1705622400, 1732924800),
-- Progetto 14
('550e8400-e29b-41d4-a716-446655440014', 'progetti', '{"br_01":"LMS Educativo","br_02":"Piattaforma di apprendimento online con corsi e quiz","br_03":340000,"br_04":45,"br_05":true,"br_06":false,"br_07":"2024-04-01","br_08":"2025-09-30","br_09":"{\"client\":\"EduTech\",\"priority\":\"medium\"}","br_10":"{\"lms\":\"#8b5cf6\",\"education\":\"#06b6d4\",\"courses\":\"#22c55e\"}"}', 1711929600, 1725148800),
-- Progetto 15
('550e8400-e29b-41d4-a716-446655440015', 'progetti', '{"br_01":"Chat in tempo reale","br_02":"Sistema di messaggistica con WebSocket e notifiche push","br_03":195000,"br_04":60,"br_05":true,"br_06":false,"br_07":"2024-06-01","br_08":"2025-02-28","br_09":"{\"client\":\"ConnectApp\",\"priority\":\"high\"}","br_10":"{\"chat\":\"#0ea5e9\",\"websocket\":\"#6366f1\",\"realtime\":\"#22c55e\"}"}', 1717200000, 1730419200),
-- Progetto 16
('550e8400-e29b-41d4-a716-446655440016', 'progetti', '{"br_01":"Portfolio Fotografico","br_02":"Sito portfolio per fotografi con galleria e lightbox","br_03":28000,"br_04":100,"br_05":true,"br_06":true,"br_07":"2023-08-01","br_08":"2023-12-15","br_09":"{\"client\":\"PhotoStudio\",\"priority\":\"low\"}","br_10":"{\"portfolio\":\"#ec4899\",\"photography\":\"#64748b\",\"gallery\":\"#f59e0b\"}"}', 1690848000, 1702684800),
-- Progetto 17
('550e8400-e29b-41d4-a716-446655440017', 'progetti', '{"br_01":"ERP Custom","br_02":"Sistema ERP su misura per industria manifatturiera","br_03":750000,"br_04":22,"br_05":true,"br_06":false,"br_07":"2024-11-01","br_08":"2026-06-30","br_09":"{\"client\":\"ManuCorp\",\"priority\":\"high\"}","br_10":"{\"erp\":\"#6366f1\",\"manufacturing\":\"#64748b\",\"enterprise\":\"#0ea5e9\"}"}', 1730419200, 1730419200),
-- Progetto 18
('550e8400-e29b-41d4-a716-446655440018', 'progetti', '{"br_01":"App Meteo","br_02":"Applicazione meteo con previsioni e mappe interattive","br_03":52000,"br_04":95,"br_05":true,"br_06":true,"br_07":"2024-02-01","br_08":"2024-08-31","br_09":"{\"client\":\"WeatherPro\",\"priority\":\"medium\"}","br_10":"{\"weather\":\"#0ea5e9\",\"maps\":\"#22c55e\",\"mobile\":\"#a855f7\"}"}', 1706745600, 1725148800),
-- Progetto 19
('550e8400-e29b-41d4-a716-446655440019', 'progetti', '{"br_01":"Sistema Prenotazione Hotel","br_02":"Piattaforma per prenotazioni alberghiere con disponibilità in tempo reale","br_03":265000,"br_04":70,"br_05":true,"br_06":false,"br_07":"2024-03-15","br_08":"2025-03-31","br_09":"{\"client\":\"HotelChain\",\"priority\":\"high\"}","br_10":"{\"booking\":\"#22c55e\",\"hotel\":\"#ef4444\",\"hospitality\":\"#f59e0b\"}"}', 1710460800, 1732924800),
-- Progetto 20
('550e8400-e29b-41d4-a716-446655440020', 'progetti', '{"br_01":"Social Network Niche","br_02":"Rete sociale verticale per professionisti del settore medico","br_03":420000,"br_04":38,"br_05":true,"br_06":false,"br_07":"2024-08-01","br_08":"2025-12-31","br_09":"{\"client\":\"MedConnect\",\"priority\":\"high\"}","br_10":"{\"social\":\"#ec4899\",\"healthcare\":\"#22c55e\",\"professional\":\"#6366f1\"}"}', 1722470400, 1735689600),
-- Progetto 21
('550e8400-e29b-41d4-a716-446655440021', 'progetti', '{"br_01":"Automazione Marketing","br_02":"Tool per email marketing e automazione campagne","br_03":158000,"br_04":82,"br_05":true,"br_06":true,"br_07":"2023-12-01","br_08":"2024-09-30","br_09":"{\"client\":\"MarketPro\",\"priority\":\"medium\"}","br_10":"{\"marketing\":\"#ec4899\",\"automation\":\"#8b5cf6\",\"email\":\"#0ea5e9\"}"}', 1701388800, 1727740800),
-- Progetto 22
('550e8400-e29b-41d4-a716-446655440022', 'progetti', '{"br_01":"Gestione Magazzino","br_02":"Sistema WMS per inventario e logistica","br_03":189000,"br_04":58,"br_05":true,"br_06":false,"br_07":"2024-05-01","br_08":"2025-04-30","br_09":"{\"client\":\"LogiWare\",\"priority\":\"high\"}","br_10":"{\"wms\":\"#f97316\",\"logistics\":\"#64748b\",\"inventory\":\"#22c55e\"}"}', 1714521600, 1732924800),
-- Progetto 23
('550e8400-e29b-41d4-a716-446655440023', 'progetti', '{"br_01":"Streaming Video","br_02":"Piattaforma video on-demand con transcoding","br_03":580000,"br_04":25,"br_05":true,"br_06":false,"br_07":"2025-02-01","br_08":"2026-06-30","br_09":"{\"client\":\"StreamHub\",\"priority\":\"high\"}","br_10":"{\"streaming\":\"#ef4444\",\"video\":\"#8b5cf6\",\"transcoding\":\"#06b6d4\"}"}', 1738368000, 1738368000),
-- Progetto 24
('550e8400-e29b-41d4-a716-446655440024', 'progetti', '{"br_01":"App Delivery","br_02":"App per consegne a domicilio con tracking GPS","br_03":235000,"br_04":67,"br_05":true,"br_06":false,"br_07":"2024-04-15","br_08":"2025-05-31","br_09":"{\"client\":\"QuickDeliver\",\"priority\":\"high\"}","br_10":"{\"delivery\":\"#f97316\",\"gps\":\"#22c55e\",\"mobile\":\"#a855f7\"}"}', 1713139200, 1732924800),
-- Progetto 25
('550e8400-e29b-41d4-a716-446655440025', 'progetti', '{"br_01":"Dashboard Amministrativa","br_02":"Pannello admin per gestione utenti e configurazioni","br_03":72000,"br_04":100,"br_05":true,"br_06":true,"br_07":"2023-10-01","br_08":"2024-03-31","br_09":"{\"client\":\"AdminSuite\",\"priority\":\"medium\"}","br_10":"{\"admin\":\"#64748b\",\"dashboard\":\"#6366f1\",\"config\":\"#14b8a6\"}"}', 1696118400, 1711929600);
