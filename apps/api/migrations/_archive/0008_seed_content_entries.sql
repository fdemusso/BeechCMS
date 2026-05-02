-- Migrazione 0008: Seed contenuti demo per tutti i Seed registrati
-- Slug supportati (vedi SEED_REGISTRY in @beech/core):
-- - articoli
-- - prodotti
-- - team
-- - testimonianze
-- - pagine
--
-- Inseriamo tra 5 e 10 record per ciascun seed, con:
-- - schema_slug = slug del Seed
-- - slug leggibile per la URL
-- - status = 'published'
-- - data = JSON con chiavi = ID dei Branch (art_*, prd_*, tm_*, tes_*, pag_*)

-- Articoli (5)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('art-0001', 'articoli', 'benvenuto-nel-blog', 'published',
 '{"art_01":"Benvenuto nel blog Beech","art_02":"2026-01-10","art_03":"/media/blog/cover-welcome.jpg","art_04":"{\"news\":\"#3b82f6\",\"annuncio\":\"#06b6d4\"}","art_05":"<p>Scopri come Beech CMS gestisce contenuti schema-driven.</p>","art_06":"Benvenuto nel blog Beech","art_07":"Introduzione al CMS ibrido SQL/JSON."}',
 unixepoch(), unixepoch()),
('art-0002', 'articoli', 'roadmap-2026', 'published',
 '{"art_01":"Roadmap prodotto 2026","art_02":"2026-02-05","art_03":"/media/blog/cover-roadmap.jpg","art_04":"{\"release\":\"#8b5cf6\",\"aggiornamento\":\"#10b981\"}","art_05":"<p>Tutte le novità in arrivo per Beech CMS.</p>","art_06":"Roadmap Beech CMS 2026","art_07":"Piano di sviluppo delle funzionalità per il 2026."}',
 unixepoch(), unixepoch()),
('art-0003', 'articoli', 'migrare-da-wordpress', 'published',
 '{"art_01":"Migrare da WordPress a Beech","art_02":"2026-02-20","art_03":"/media/blog/cover-migration.jpg","art_04":"{\"guida\":\"#f59e0b\",\"cms\":\"#3b82f6\"}","art_05":"<p>Guida pratica per migrare contenuti senza downtime.</p>","art_06":"Migrazione da WordPress","art_07":"Strategie per migrare contenuti in sicurezza."}',
 unixepoch(), unixepoch()),
('art-0004', 'articoli', 'pattern-registry-ui', 'published',
 '{"art_01":"Il Pattern Registry della UI","art_02":"2026-03-01","art_03":"/media/blog/cover-registry.jpg","art_04":"{\"tutorial\":\"#ec4899\",\"guida\":\"#64748b\"}","art_05":"<p>Come il registry dei field semplifica la dashboard.</p>","art_06":"Pattern Registry UI","art_07":"Architettura dei componenti field-driven."}',
 unixepoch(), unixepoch()),
('art-0005', 'articoli', 'edge-first-architecture', 'published',
 '{"art_01":"Architettura edge-first con Cloudflare","art_02":"2026-03-05","art_03":"/media/blog/cover-edge.jpg","art_04":"{\"news\":\"#ef4444\",\"aggiornamento\":\"#06b6d4\"}","art_05":"<p>Perché Beech nasce per l&apos;edge.</p>","art_06":"Architettura edge-first","art_07":"Vantaggi di un CMS progettato per l&apos;edge."}',
 unixepoch(), unixepoch());

-- Prodotti (5)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('prd-0001', 'prodotti', 'beech-starter', 'published',
 '{"prd_01":"Beech Starter","prd_02":490,"prd_03":50,"prd_04":true,"prd_05":"/media/products/starter.png","prd_06":"[\"/media/products/starter-1.png\",\"/media/products/starter-2.png\"]","prd_07":"Piano entry-level per piccoli siti e landing.","prd_08":"Beech Starter","prd_09":"Piano starter per progetti piccoli e medi."}',
 unixepoch(), unixepoch()),
('prd-0002', 'prodotti', 'beech-pro', 'published',
 '{"prd_01":"Beech Pro","prd_02":1290,"prd_03":30,"prd_04":true,"prd_05":"/media/products/pro.png","prd_06":"[\"/media/products/pro-1.png\",\"/media/products/pro-2.png\"]","prd_07":"Tutte le feature avanzate per team strutturati.","prd_08":"Beech Pro","prd_09":"Piano professionale per agenzie e team marketing."}',
 unixepoch(), unixepoch()),
('prd-0003', 'prodotti', 'beech-enterprise', 'published',
 '{"prd_01":"Beech Enterprise","prd_02":3990,"prd_03":10,"prd_04":true,"prd_05":"/media/products/enterprise.png","prd_06":"[\"/media/products/enterprise-1.png\"]","prd_07":"Funzionalità enterprise, audit log e multi-ambiente.","prd_08":"Beech Enterprise","prd_09":"Soluzione enterprise per grandi organizzazioni."}',
 unixepoch(), unixepoch()),
('prd-0004', 'prodotti', 'implementazione-custom', 'published',
 '{"prd_01":"Implementazione custom","prd_02":15000,"prd_03":3,"prd_04":true,"prd_05":"/media/products/custom.png","prd_06":"[]","prd_07":"Servizio di implementazione su misura di Beech CMS.","prd_08":"Implementazione custom Beech","prd_09":"Servizio di onboarding e integrazione personalizzata."}',
 unixepoch(), unixepoch()),
('prd-0005', 'prodotti', 'workshop-botanical-engine', 'published',
 '{"prd_01":"Workshop Botanical Engine","prd_02":990,"prd_03":20,"prd_04":true,"prd_05":"/media/products/workshop.png","prd_06":"[]","prd_07":"Workshop avanzato sul Botanical Engine e sul registry dei seed.","prd_08":"Workshop Botanical Engine","prd_09":"Formazione per team tecnici su Beech CMS."}',
 unixepoch(), unixepoch());

-- Team (5)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('tm-0001', 'team', 'flavio-de-musso', 'published',
 '{"tm_01":"Flavio De Musso","tm_02":"Founder & Principal Engineer","tm_03":"Progetta architetture moderne per CMS headless e prodotti digitali.","tm_04":"/media/team/flavio.jpg","tm_05":"https://www.linkedin.com/in/flaviodemusso","tm_06":true,"tm_07":"Flavio De Musso","tm_08":"Founder e creatore di Beech CMS."}',
 unixepoch(), unixepoch()),
('tm-0002', 'team', 'product-designer', 'published',
 '{"tm_01":"Laura Rossi","tm_02":"Product Designer","tm_03":"Cura la UX della dashboard e dei workflow editoriali.","tm_04":"/media/team/laura.jpg","tm_05":"https://www.linkedin.com","tm_06":true,"tm_07":"Product Designer Beech","tm_08":"UX designer focalizzata su strumenti per content team."}',
 unixepoch(), unixepoch()),
('tm-0003', 'team', 'frontend-engineer', 'published',
 '{"tm_01":"Marco Bianchi","tm_02":"Frontend Engineer","tm_03":"Sviluppa i field renderer React e il registry della UI.","tm_04":"/media/team/marco.jpg","tm_05":"https://www.linkedin.com","tm_06":true,"tm_07":"Frontend Engineer","tm_08":"Sviluppatore frontend specializzato in React e UX."}',
 unixepoch(), unixepoch()),
('tm-0004', 'team', 'devrel', 'published',
 '{"tm_01":"Giulia Verdi","tm_02":"Developer Relations","tm_03":"Aiuta i team a integrare Beech CMS nelle loro pipeline.","tm_04":"/media/team/giulia.jpg","tm_05":"https://www.linkedin.com","tm_06":true,"tm_07":"DevRel Beech","tm_08":"Developer advocate per la community Beech."}',
 unixepoch(), unixepoch()),
('tm-0005', 'team', 'support-specialist', 'published',
 '{"tm_01":"Andrea Neri","tm_02":"Support Specialist","tm_03":"Supporto di primo livello per clienti enterprise.","tm_04":"/media/team/andrea.jpg","tm_05":"https://www.linkedin.com","tm_06":true,"tm_07":"Support Specialist","tm_08":"Supporto tecnico e customer success."}',
 unixepoch(), unixepoch());

-- Testimonianze (5)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('tes-0001', 'testimonianze', 'acme-corp', 'published',
 '{"tes_01":"Chiara Conti","tes_02":"Acme Corp","tes_03":"Con Beech CMS abbiamo ridotto del 60% il tempo di pubblicazione dei contenuti.","tes_04":5,"tes_05":"2026-01-20","tes_06":"/media/testimonials/acme.jpg","tes_07":true,"tes_08":"Caso studio Acme","tes_09":"Come Acme ha accelerato i workflow editoriali."}',
 unixepoch(), unixepoch()),
('tes-0002', 'testimonianze', 'studio-x', 'published',
 '{"tes_01":"Luca Ferri","tes_02":"Studio X","tes_03":"La flessibilità degli schema ci ha permesso di iterare velocemente sul design.","tes_04":4,"tes_05":"2026-02-02","tes_06":"/media/testimonials/studiox.jpg","tes_07":true,"tes_08":"Testimonianza Studio X","tes_09":"Feedback di un&apos;agenzia digital sul CMS."}',
 unixepoch(), unixepoch()),
('tes-0003', 'testimonianze', 'media-hub', 'published',
 '{"tes_01":"Sara Galli","tes_02":"MediaHub","tes_03":"Finalmente un CMS pensato per il contenuto, non per il database.","tes_04":5,"tes_05":"2026-02-15","tes_06":"/media/testimonials/mediahub.jpg","tes_07":true,"tes_08":"Testimonianza MediaHub","tes_09":"Perché i content team amano Beech."}',
 unixepoch(), unixepoch()),
('tes-0004', 'testimonianze', 'shop-co', 'published',
 '{"tes_01":"Davide Rizzi","tes_02":"ShopCo","tes_03":"Gestire landing e pagine prodotto è diventato molto più semplice.","tes_04":4,"tes_05":"2026-02-25","tes_06":"/media/testimonials/shopco.jpg","tes_07":true,"tes_08":"Testimonianza ShopCo","tes_09":"Beech CMS per e-commerce moderni."}',
 unixepoch(), unixepoch()),
('tes-0005', 'testimonianze', 'fit-tech', 'published',
 '{"tes_01":"Elena Santi","tes_02":"FitTech Inc","tes_03":"La dashboard è così intuitiva che il team marketing la usa senza training.","tes_04":5,"tes_05":"2026-03-03","tes_06":"/media/testimonials/fittech.jpg","tes_07":true,"tes_08":"Testimonianza FitTech","tes_09":"Esperienza di un team marketing su Beech CMS."}',
 unixepoch(), unixepoch());

-- Pagine (5)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('pag-0001', 'pagine', 'home', 'published',
 '{"pag_01":"Homepage","pag_02":"/media/pages/home-hero.jpg","pag_03":"<h1>Beech CMS</h1><p>Il CMS schema-driven per l&apos;era edge.</p>","pag_04":"Beech CMS - Homepage","pag_05":"CMS moderno schema-driven per deployment edge."}',
 unixepoch(), unixepoch()),
('pag-0002', 'pagine', 'prodotto', 'published',
 '{"pag_01":"Il prodotto","pag_02":"/media/pages/product-hero.jpg","pag_03":"<h1>Perché Beech</h1><p>Architettura ibrida SQL/JSON, seed e Botanical Engine.</p>","pag_04":"Perché scegliere Beech","pag_05":"Scopri le funzionalità chiave di Beech CMS."}',
 unixepoch(), unixepoch()),
('pag-0003', 'pagine', 'casi-studio', 'published',
 '{"pag_01":"Casi studio","pag_02":"/media/pages/cases-hero.jpg","pag_03":"<h1>Storie di successo</h1><p>Come i team usano Beech ogni giorno.</p>","pag_04":"Casi studio Beech","pag_05":"Raccolta di case study su Beech CMS."}',
 unixepoch(), unixepoch()),
('pag-0004', 'pagine', 'pricing', 'published',
 '{"pag_01":"Pricing","pag_02":"/media/pages/pricing-hero.jpg","pag_03":"<h1>Piani e prezzi</h1><p>Scegli il piano adatto al tuo team.</p>","pag_04":"Pricing Beech CMS","pag_05":"Confronta i piani Starter, Pro ed Enterprise."}',
 unixepoch(), unixepoch()),
('pag-0005', 'pagine', 'contatti', 'published',
 '{"pag_01":"Contatti","pag_02":"/media/pages/contact-hero.jpg","pag_03":"<h1>Parliamo del tuo progetto</h1><p>Compila il form per una demo.</p>","pag_04":"Contatta Beech","pag_05":"Richiedi una demo o una consulenza su Beech CMS."}',
 unixepoch(), unixepoch());

