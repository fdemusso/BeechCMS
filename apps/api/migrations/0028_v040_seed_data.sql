-- =============================================================================
-- Beech CMS v0.4.0 — Dati demo per le tabelle content_{slug}
--
-- NOTA: Questa migration richiede che le tabelle content_{slug} esistano già.
-- Eseguire prima: beech seed:load --local
--
-- I dati seed v0.3.0 usavano content_entries (JSON blob).
-- In v0.4.0 ogni Seed ha una tabella dedicata con colonne reali:
--   content_articoli, content_prodotti, content_team,
--   content_testimonianze, content_pagine, content_clienti, content_messaggi
-- =============================================================================




-- =============================================================================
-- TEAM (seed: team)
-- Colonne: name, role, bio, photo, linkedIn, active, metaTitle, metaDescription
-- =============================================================================
INSERT OR IGNORE INTO content_team (id, slug, status, name, role, bio, photo, linkedIn, active, metaTitle, metaDescription, created_at, updated_at) VALUES

('tm-0001', 'flavio-de-musso', 'published',
 'Flavio De Musso', 'Founder & Principal Engineer',
 'Progetta architetture moderne per CMS headless e prodotti digitali edge-native.',
 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
 'https://www.linkedin.com/in/flaviodemusso',
 1,
 'Flavio De Musso', 'Founder e creatore di Beech CMS.',
 unixepoch(), unixepoch()),

('tm-0002', 'laura-rossi', 'published',
 'Laura Rossi', 'Product Designer',
 'Cura la UX della dashboard e dei workflow editoriali. Specializzata in design system a scala.',
 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
 'https://www.linkedin.com/in/',
 1,
 'Laura Rossi – Designer', 'UX designer focalizzata su strumenti per content team.',
 unixepoch(), unixepoch()),

('tm-0003', 'marco-bianchi', 'published',
 'Marco Bianchi', 'Frontend Engineer',
 'Sviluppa i field renderer React e il registry della UI. Appassionato di performance web.',
 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80',
 'https://www.linkedin.com/in/',
 1,
 'Marco Bianchi – Engineer', 'Sviluppatore frontend specializzato in React e UX.',
 unixepoch(), unixepoch()),

('tm-0004', 'giulia-verdi', 'published',
 'Giulia Verdi', 'Developer Relations',
 'Aiuta i team a integrare Beech CMS nelle loro pipeline di sviluppo. Developer Advocate.',
 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80',
 'https://www.linkedin.com/in/',
 1,
 'Giulia Verdi – DevRel', 'Developer advocate per la community Beech.',
 unixepoch(), unixepoch()),

('tm-0005', 'andrea-neri', 'published',
 'Andrea Neri', 'Support Specialist',
 'Supporto di primo livello per clienti enterprise e gestione della knowledge base.',
 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80',
 'https://www.linkedin.com/in/',
 1,
 'Andrea Neri – Support', 'Supporto tecnico e customer success.',
 unixepoch(), unixepoch());


-- =============================================================================
-- PRODOTTI (seed: prodotti)
-- Colonne: name, price, stock, active, coverImage, images, description, metaTitle, metaDescription
-- =============================================================================
INSERT OR IGNORE INTO content_prodotti (id, slug, status, name, price, stock, active, coverImage, images, description, metaTitle, metaDescription, created_at, updated_at) VALUES

('prd-0001', 'beech-starter', 'published',
 'Beech Starter', 490, 50, 1,
 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80',
 '[]',
 '<p>Piano entry-level per piccoli siti e landing page. Include il Botanical Engine, la dashboard, e 1GB di storage R2.</p>',
 'Beech Starter', 'Piano starter per progetti piccoli e medi.',
 unixepoch(), unixepoch()),

('prd-0002', 'beech-pro', 'published',
 'Beech Pro', 1290, 30, 1,
 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=800&q=80',
 '[]',
 '<p>Tutte le feature avanzate per team strutturati: draft workflow, analytics per-seed, FTS5 full-text search, 10GB storage R2.</p>',
 'Beech Pro', 'Piano professionale per agenzie e team marketing.',
 unixepoch(), unixepoch()),

('prd-0003', 'beech-enterprise', 'published',
 'Beech Enterprise', 3990, 10, 1,
 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80',
 '[]',
 '<p>Funzionalità enterprise, audit log, SLA garantito, multi-ambiente staging/production, e storage R2 illimitato.</p>',
 'Beech Enterprise', 'Soluzione enterprise per grandi organizzazioni.',
 unixepoch(), unixepoch()),

('prd-0004', 'implementazione-custom', 'published',
 'Implementazione custom', 15000, 3, 1,
 'https://images.unsplash.com/photo-1593642532744-d377ab507dc8?w=800&q=80',
 '[]',
 '<p>Servizio di implementazione su misura di Beech CMS: analisi dei requisiti, definizione dei Seed, deploy su Cloudflare, formazione team.</p>',
 'Implementazione custom Beech', 'Servizio di onboarding e integrazione personalizzata.',
 unixepoch(), unixepoch()),

('prd-0005', 'workshop-botanical-engine', 'published',
 'Workshop Botanical Engine', 990, 20, 1,
 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
 '[]',
 '<p>Workshop avanzato sul Botanical Engine e sul registry dei seed. Impara a definire Seed ottimali e a usare beech seed:load per deployare schemi.</p>',
 'Workshop Botanical Engine', 'Formazione per team tecnici su Beech CMS.',
 unixepoch(), unixepoch());


-- =============================================================================
-- ARTICOLI (seed: articoli)
-- Colonne: title, publishedAt, coverImage, tags, body, metaTitle, metaDescription
-- =============================================================================
INSERT OR IGNORE INTO content_articoli (id, slug, status, title, publishedAt, coverImage, tags, body, metaTitle, metaDescription, created_at, updated_at) VALUES

('art-0001', 'benvenuto-nel-blog', 'published',
 'Benvenuto nel blog Beech',
 1736467200,
 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80',
 '["news","annuncio"]',
 '<p>Scopri come Beech CMS gestisce contenuti schema-driven con tabelle SQL dedicate per ogni tipo di contenuto.</p><h3>Architettura moderna</h3><p>Beech v0.4.0 elimina il JSON blob e usa colonne reali per ogni Branch del Seed. Il risultato è performance migliorate e query native SQLite.</p>',
 'Benvenuto nel blog Beech',
 'Introduzione al CMS headless schema-driven.',
 unixepoch(), unixepoch()),

('art-0002', 'roadmap-2026', 'published',
 'Roadmap prodotto 2026',
 1738713600,
 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80',
 '["release","aggiornamento"]',
 '<p>Tutte le novità in arrivo per Beech CMS nel 2026: Doctype Architecture, CLI seed:load, FTS5 per-seed, e molto altro.</p><h3>Fase 1 — Core</h3><p>Il Botanical Engine diventa un compilatore di schema che genera DDL SQL dalla definizione TypeScript dei Seed.</p>',
 'Roadmap Beech CMS 2026',
 'Piano di sviluppo delle funzionalità per il 2026.',
 unixepoch(), unixepoch()),

('art-0003', 'migrare-da-wordpress', 'published',
 'Migrare da WordPress a Beech',
 1740182400,
 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800&q=80',
 '["guida","cms"]',
 '<p>Guida pratica per migrare contenuti da WordPress a Beech CMS senza downtime. Esporta, trasforma e importa usando la Public API.</p><h3>Step 1: Esporta da WordPress</h3><p>Usa il plugin WP All Export per ottenere CSV o JSON dai post. Poi mappali alle colonne del tuo Seed.</p>',
 'Migrazione da WordPress a Beech',
 'Strategie per migrare contenuti in sicurezza.',
 unixepoch(), unixepoch()),

('art-0004', 'pattern-registry-ui', 'published',
 'Il Pattern Registry della UI',
 1740873600,
 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
 '["tutorial","guida"]',
 '<p>Come il registry dei field renderer semplifica la dashboard: ogni Branch type ha un renderer React dedicato, registrato centralmente e richiamato automaticamente.</p>',
 'Pattern Registry UI Beech',
 'Architettura dei componenti field-driven.',
 unixepoch(), unixepoch()),

('art-0005', 'edge-first-architecture', 'published',
 'Architettura edge-first con Cloudflare',
 1741132800,
 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
 '["news","aggiornamento"]',
 '<p>Perché Beech nasce per l''edge: latenza minima, zero cold start, D1 SQLite replicato globalmente su Cloudflare. Il CMS arriva dove si trovano gli utenti.</p>',
 'Architettura edge-first',
 'Vantaggi di un CMS progettato per l''edge.',
 unixepoch(), unixepoch());


-- =============================================================================
-- TESTIMONIANZE (seed: testimonianze)
-- Colonne: author, company, quote, rating, date, photo, active, metaTitle, metaDescription
-- =============================================================================
INSERT OR IGNORE INTO content_testimonianze (id, slug, status, author, company, quote, rating, date, photo, active, metaTitle, metaDescription, created_at, updated_at) VALUES

('tes-0001', 'acme-corp', 'published',
 'Chiara Conti', 'Acme Corp',
 'Con Beech CMS abbiamo ridotto del 60% il tempo di pubblicazione dei contenuti.',
 5, 1737331200,
 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80',
 1, 'Caso studio Acme', 'Come Acme ha accelerato i workflow editoriali.',
 unixepoch(), unixepoch()),

('tes-0002', 'studio-x', 'published',
 'Luca Ferri', 'Studio X',
 'La flessibilità degli schema ci ha permesso di iterare velocemente sul design del sito.',
 4, 1738195200,
 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80',
 1, 'Testimonianza Studio X', 'Feedback di un''agenzia digital sul CMS.',
 unixepoch(), unixepoch()),

('tes-0003', 'media-hub', 'published',
 'Sara Galli', 'MediaHub',
 'Finalmente un CMS pensato per il contenuto, non per il database. Team felicissimo.',
 5, 1739404800,
 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80',
 1, 'Testimonianza MediaHub', 'Perché i content team amano Beech.',
 unixepoch(), unixepoch()),

('tes-0004', 'shop-co', 'published',
 'Davide Rizzi', 'ShopCo',
 'Gestire landing e pagine prodotto è diventato molto più semplice. Alta raccomandazione.',
 4, 1740268800,
 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
 1, 'Testimonianza ShopCo', 'Beech CMS per e-commerce moderni.',
 unixepoch(), unixepoch()),

('tes-0005', 'fit-tech', 'published',
 'Elena Santi', 'FitTech Inc',
 'La dashboard è così intuitiva che il team marketing la usa senza training.',
 5, 1741046400,
 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80',
 1, 'Testimonianza FitTech', 'Esperienza di un team marketing su Beech CMS.',
 unixepoch(), unixepoch());


-- =============================================================================
-- PAGINE (seed: pagine)
-- Colonne: title, coverImage, body, metaTitle, metaDescription
-- =============================================================================
INSERT OR IGNORE INTO content_pagine (id, slug, status, title, coverImage, body, metaTitle, metaDescription, created_at, updated_at) VALUES

('pag-0001', 'home', 'published',
 'Homepage',
 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&q=80',
 '<h1>Beech CMS</h1><p>Il CMS schema-driven per l''era edge. Definisci i tuoi Seed in TypeScript, deploya su Cloudflare, e inizia a pubblicare.</p>',
 'Beech CMS - Homepage', 'CMS moderno schema-driven per deployment edge.',
 unixepoch(), unixepoch()),

('pag-0002', 'il-prodotto', 'published',
 'Il prodotto',
 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
 '<h1>Perché Beech</h1><p>Architettura ibrida con tabelle SQL dedicate per Seed, Botanical Engine come compilatore di schema, e CLI per il deploy.</p>',
 'Perché scegliere Beech', 'Scopri le funzionalità chiave di Beech CMS.',
 unixepoch(), unixepoch()),

('pag-0003', 'casi-studio', 'published',
 'Casi studio',
 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&q=80',
 '<h1>Storie di successo</h1><p>Come i team usano Beech ogni giorno per pubblicare contenuti velocemente con la dashboard schema-driven.</p>',
 'Casi studio Beech', 'Raccolta di case study su Beech CMS.',
 unixepoch(), unixepoch()),

('pag-0004', 'pricing', 'published',
 'Pricing',
 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
 '<h1>Piani e prezzi</h1><p>Scegli il piano adatto al tuo team: Starter, Pro o Enterprise. Tutti includono il Botanical Engine e la dashboard.</p>',
 'Pricing Beech CMS', 'Confronta i piani Starter, Pro ed Enterprise.',
 unixepoch(), unixepoch()),

('pag-0005', 'contatti', 'published',
 'Contatti',
 'https://images.unsplash.com/photo-1423666639041-f56000c27a9a?w=1200&q=80',
 '<h1>Parliamo del tuo progetto</h1><p>Compila il form per una demo gratuita. Il team risponde entro 24 ore lavorative.</p>',
 'Contatta Beech', 'Richiedi una demo o una consulenza su Beech CMS.',
 unixepoch(), unixepoch());


-- =============================================================================
-- CLIENTI (seed: clienti)
-- Colonne: name, email, passwordHash, tier, phone, internalNote, registeredAt, active
-- passwordHash = sha256 di password demo (già hashato come farebbe applyPrivacy)
-- =============================================================================
INSERT OR IGNORE INTO content_clienti (id, slug, status, name, email, passwordHash, tier, phone, internalNote, registeredAt, active, created_at, updated_at) VALUES

('clt-0001', 'marco-rossi', 'published',
 'Marco Rossi', 'marco.rossi@acmecorp.it',
 '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
 'enterprise', '+39 02 1234 5678',
 'Cliente storico. Sconto applicato del 20% su rinnovo annuale.',
 1710460800, 1,
 unixepoch(), unixepoch()),

('clt-0002', 'laura-bianchi', 'published',
 'Laura Bianchi', 'laura.bianchi@studiox.io',
 '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
 'pro', '+39 06 9876 5432',
 'Contattare prima del rinnovo per upsell a enterprise.',
 1736294400, 1,
 unixepoch(), unixepoch()),

('clt-0003', 'davide-ferrari', 'published',
 'Davide Ferrari', 'davide@mediahub.eu',
 '1c8bfe8f801d79745c4631d09fff36c82aa37fc4cce4fc946683d7b336b63032',
 'starter', '+39 011 4567 890',
 'Ha richiesto supporto per migrazione da WordPress.',
 1750550400, 1,
 unixepoch(), unixepoch()),

('clt-0004', 'giulia-verdi', 'published',
 'Giulia Verdi', 'giulia.verdi@personal.me',
 '6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090',
 'free', '+39 081 3210 987',
 'Account free scaduto. Inviare offerta upgrade.',
 1756771200, 0,
 unixepoch(), unixepoch()),

('clt-0005', 'sofia-costa', 'published',
 'Sofia Costa', 'sofia.costa@fittech.com',
 '65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5',
 'pro', NULL,
 NULL,
 1769731200, 1,
 unixepoch(), unixepoch());


-- =============================================================================
-- MESSAGGI (seed: messaggi)
-- Colonne: name, email, subject, message, read
-- allowPublicPost: true — forma di contatto dal testsite
-- =============================================================================
INSERT OR IGNORE INTO content_messaggi (id, slug, status, name, email, subject, message, read, created_at, updated_at) VALUES

('msg-0001', 'msg-demo-1', 'published',
 'Riccardo Esposito', 'riccardo@example.com',
 'Richiesta demo Beech Pro',
 '<p>Buongiorno, siamo un''agenzia di 8 persone e vorremmo valutare Beech Pro per i nostri clienti. Possiamo fissare una call la prossima settimana?</p>',
 0, unixepoch(), unixepoch()),

('msg-0002', 'msg-demo-2', 'published',
 'Anna Marchetti', 'anna@startup.io',
 'Domanda su FTS5 e ricerca full-text',
 '<p>Ciao team! Sto valutando Beech per un progetto di knowledge base. La ricerca full-text FTS5 funziona anche sulla versione Starter? Grazie.</p>',
 1, unixepoch(), unixepoch()),

('msg-0003', 'msg-demo-3', 'published',
 'Francesco Lombardi', 'f.lombardi@enterprise.it',
 'Beech Enterprise — SLA e uptime',
 '<p>Siamo interessati al piano Enterprise. Quali SLA garantite? Abbiamo bisogno di 99.9% uptime per un''applicazione mission-critical.</p>',
 0, unixepoch(), unixepoch());
