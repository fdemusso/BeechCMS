-- Svuotiamo le tabelle prima di inserire i nuovi seed di test reali
DELETE FROM content_entries;

-- Articoli presi da risorse tech e resi perfetti per la visualizzazione
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('art-test-1', 'articoli', 'evoluzione-react-19', 'published',
 '{"art_01":"L''evoluzione di React 19","art_02":"2026-04-10","art_03":"https://images.unsplash.com/photo-1633356122544-f134324a6cee?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80","art_04":"{\"news\":\"#3b82f6\",\"tutorial\":\"#06b6d4\"}","art_05":"<p>React 19 introduce fondamentali miglioramenti come il React Compiler che automatizza gran parte delle ottimizzazioni che prima richiedevano useMemo e useCallback. Oltre a questo, i Server Components sono ormai diventati il fulcro della User Experience moderna. Nel futuro del Web Design vedremo framework basati su Rust, e il frontend diventerà sempre più veloce e performante.</p><h3>Server Components</h3><p>Una vera rivoluzione prestazionale. Invece di inviare gigabyte di javascript, i nostri server elaborano l''interfaccia spedendo al client solo ciò che serve.</p>","art_06":"Evoluzione di React 19 - News","art_07":"Le ultime novità nel mondo di React 19, Compiler e Server Components."}',
 unixepoch(), unixepoch()),

('art-test-2', 'articoli', 'tailwind-v4-novita', 'published',
 '{"art_01":"Tutte le Novità di Tailwind CSS v4","art_02":"2026-04-12","art_03":"https://images.unsplash.com/photo-1542831371-29b0f74f9713?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80","art_04":"{\"aggiornamento\":\"#10b981\",\"guida\":\"#f59e0b\"}","art_05":"<p>Con Tailwind v4 diciamo addio alle lunghe configurazioni JS e abbracciamo il nuovo paradigma CSS-first. Finalmente, la flessibilità dei framework utility-first si incontra con la potenza delle Custom Properties di CSS. Oltre a compilation time incredibilmente bassi, Tailwind v4 offre un sistema di design token nativo fantastico.</p>","art_06":"Tailwind CSS v4 - Novità","art_07":"Un approfondimento sulle features della nuova major version di Tailwind CSS."}',
 unixepoch(), unixepoch()),

('art-test-3', 'articoli', 'design-system-nel-2026', 'published',
 '{"art_01":"Design System nel 2026","art_02":"2026-04-13","art_03":"https://images.unsplash.com/photo-1561070791-2526d30994b5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80","art_04":"{\"cms\":\"#ec4899\"}","art_05":"<p>I design system sono maturati enormemente grazie all''integrazione con AI e CMS Headless come Beech CMS. Il pattern schema-driven permette di adattare le UI alle tipologie di dati automaticamente. Addio componenti rigidi, diamo il benvenuto ai field-renderer dinamici e auto-consistenti.</p>","art_06":"Design System del Futuro","art_07":"Come l''automazione sta cambiando l''accessibilità e il design a scala."}',
 unixepoch(), unixepoch());

-- Prodotti (visti come Gallery nel sito di Test)
INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at) VALUES
('gal-test-1', 'prodotti', 'setup-minimalista', 'published',
 '{"prd_01":"Setup Minimalista da Sviluppatore","prd_02":0,"prd_03":0,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80","prd_06":"[]","prd_07":"L''arte dell''essenziale sulla scrivania.","prd_08":"Setup","prd_09":"Setup desk."}',
 unixepoch(), unixepoch()),

('gal-test-2', 'prodotti', 'architettura-server', 'published',
 '{"prd_01":"L''Eleganza dei Datacenter","prd_02":0,"prd_03":0,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1558494949-ef010cbdcc31?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80","prd_06":"[\"https://images.unsplash.com/photo-1544197150-b99a580bb7a8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80\"]","prd_07":"Server rack.","prd_08":"Datacenter","prd_09":"Datacenter view."}',
 unixepoch(), unixepoch()),

('gal-test-3', 'prodotti', 'lavoro-remoto', 'published',
 '{"prd_01":"Lavoro da Remoto nella Natura","prd_02":0,"prd_03":0,"prd_04":true,"prd_05":"https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80","prd_06":"[\"https://images.unsplash.com/photo-1593642532744-d377ab507dc8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80\", \"https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80\"]","prd_07":"Ibrido vita e lavoro nel 2026.","prd_08":"Remote work","prd_09":"Codice e natura."}',
 unixepoch(), unixepoch());

