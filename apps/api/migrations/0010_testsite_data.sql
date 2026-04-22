-- Migrazione 0010: Seed contenuti per il testsite (DX testing)
-- Vengono inseriti record con immagini di alta qualita' da Unsplash.

INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('test-art-01', 'articoli', 'design-system-vibes', 'published',
 '{"art_01":"Design System: Il Cuore del Testsite","art_02":"2026-04-10","art_03":"https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80&w=2000&h=1000","art_04":"{\"design\":\"#3b82f6\",\"dx\":\"#10b981\"}","art_05":"<p>Un design system solido è la chiave per un frontend eccellente. Con Beech CMS e Shadcn UI, costruiamo interfacce in un batter d''occhio.</p>","art_06":"Design System","art_07":"Scopri come integrare componenti premium nel tuo progetto."}',
 unixepoch(), unixepoch()),
('test-art-02', 'articoli', 'edge-computing-future', 'published',
 '{"art_01":"Il Futuro è Edge Computing","art_02":"2026-04-12","art_03":"https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000&h=1000","art_04":"{\"cloud\":\"#8b5cf6\",\"edge\":\"#ec4899\"}","art_05":"<p>Beech CMS nasce per Cloudflare Workers, offrendo performance incredibili a livello globale senza la necessità di complessi bilanciatori di carico.</p>","art_06":"Edge Computing","art_07":"Perché Cloudflare Workers cambierà tutto."}',
 unixepoch(), unixepoch()),
('test-art-03', 'articoli', 'premium-typography', 'published',
 '{"art_01":"L''Arte della Tipografia","art_02":"2026-04-15","art_03":"https://images.unsplash.com/photo-1596541223140-5b565a0b9380?auto=format&fit=crop&q=80&w=2000&h=1000","art_04":"{\"ui\":\"#f59e0b\",\"typography\":\"#06b6d4\"}","art_05":"<p>Una tipografia curata può trasformare un semplice sito web in un''esperienza utente di classe mondiale. Inter, Roboto e Outfit sono le nostre prime scelte.</p>","art_06":"Tipografia Premium","art_07":"Eleva i tuoi contenuti con i font giusti."}',
 unixepoch(), unixepoch());

-- Usiamo 'prodotti' come Galleria Fotografica
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('test-gal-01', 'prodotti', 'architecture-modern', 'published',
 '{"prd_01":"Architettura Moderna","prd_02":0,"prd_03":1,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800&h=800","prd_06":"[\"https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80\",\"https://images.unsplash.com/photo-1428366890462-dd4baecf492b?auto=format&fit=crop&q=80\"]","prd_07":"<p>Collezione fotografica di architetture di fascia alta, per dimostrare l''uso di immagini asset-list in Tailwind e css moderni.</p>","prd_08":"Architettura Moderna","prd_09":"Galleria di architettura contemporanea."}',
 unixepoch(), unixepoch()),
('test-gal-02', 'prodotti', 'nature-landscapes', 'published',
 '{"prd_01":"Paesaggi Incontaminati","prd_02":0,"prd_03":1,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800&h=800","prd_06":"[\"https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&q=80\",\"https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&q=80\"]","prd_07":"<p>Immagini rilassanti della natura, perfette per una galleria premium responsive.</p>","prd_08":"Paesaggi Incontaminati","prd_09":"Bellezza della natura in alta definizione."}',
 unixepoch(), unixepoch()),
('test-gal-03', 'prodotti', 'abstract-art', 'published',
 '{"prd_01":"Arte Astratta e Luce","prd_02":0,"prd_03":1,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=800&h=800","prd_06":"[]","prd_07":"<p>Giochi di luce e neon renderizzati per esplorare contrasti cromatici decisi nel glassmorphism UI.</p>","prd_08":"Arte Astratta e Luce","prd_09":"Un tuffo in effetti visivi astratti."}',
 unixepoch(), unixepoch());

-- Landing Page
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('test-pag-01', 'pagine', 'test-home', 'published',
 '{"pag_01":"BeechCMS Test Experience","pag_02":"https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=2000&h=1000","pag_03":"<h1>Benvenuti nella DX Demo</h1><p>Esplora il design, la reattività della Public API e prova tu stesso il contact module.</p>","pag_04":"BeechCMS - Test","pag_05":"Pagina di test del framework."}',
 unixepoch(), unixepoch());
