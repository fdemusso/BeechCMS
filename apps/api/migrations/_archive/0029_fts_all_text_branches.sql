-- =============================================================================
-- Beech CMS — FTS rebuild: index text + richtext branches
--
-- Previously only `richtext` branches were indexed. This migration rebuilds
-- all per-seed FTS5 tables to also include `text` branches (with search:true).
-- Seeds that had no FTS (team, testimonianze, clienti) get new tables here.
-- =============================================================================

-- ─── articoli ─────────────────────────────────────────────────────────────────
-- Was: body only. Now: title, body, metaTitle, metaDescription

DROP TRIGGER IF EXISTS fts_articoli_insert;
DROP TRIGGER IF EXISTS fts_articoli_update;
DROP TRIGGER IF EXISTS fts_articoli_delete;
DROP TABLE IF EXISTS fts_articoli;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_articoli USING fts5(
  entry_id UNINDEXED,
  title,
  body,
  metaTitle,
  metaDescription,
  tokenize = 'unicode61'
);

INSERT INTO fts_articoli(entry_id, title, body, metaTitle, metaDescription)
SELECT id, title, body, metaTitle, metaDescription FROM content_articoli;

CREATE TRIGGER IF NOT EXISTS fts_articoli_insert
AFTER INSERT ON content_articoli BEGIN
  INSERT INTO fts_articoli(entry_id, title, body, metaTitle, metaDescription)
  VALUES (new.id, new.title, new.body, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_articoli_update
AFTER UPDATE OF title, body, metaTitle, metaDescription ON content_articoli BEGIN
  DELETE FROM fts_articoli WHERE entry_id = old.id;
  INSERT INTO fts_articoli(entry_id, title, body, metaTitle, metaDescription)
  VALUES (new.id, new.title, new.body, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_articoli_delete
AFTER DELETE ON content_articoli BEGIN
  DELETE FROM fts_articoli WHERE entry_id = old.id;
END;


-- ─── prodotti ─────────────────────────────────────────────────────────────────
-- Was: description only. Now: name, description, metaTitle, metaDescription

DROP TRIGGER IF EXISTS fts_prodotti_insert;
DROP TRIGGER IF EXISTS fts_prodotti_update;
DROP TRIGGER IF EXISTS fts_prodotti_delete;
DROP TABLE IF EXISTS fts_prodotti;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_prodotti USING fts5(
  entry_id UNINDEXED,
  name,
  description,
  metaTitle,
  metaDescription,
  tokenize = 'unicode61'
);

INSERT INTO fts_prodotti(entry_id, name, description, metaTitle, metaDescription)
SELECT id, name, description, metaTitle, metaDescription FROM content_prodotti;

CREATE TRIGGER IF NOT EXISTS fts_prodotti_insert
AFTER INSERT ON content_prodotti BEGIN
  INSERT INTO fts_prodotti(entry_id, name, description, metaTitle, metaDescription)
  VALUES (new.id, new.name, new.description, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_prodotti_update
AFTER UPDATE OF name, description, metaTitle, metaDescription ON content_prodotti BEGIN
  DELETE FROM fts_prodotti WHERE entry_id = old.id;
  INSERT INTO fts_prodotti(entry_id, name, description, metaTitle, metaDescription)
  VALUES (new.id, new.name, new.description, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_prodotti_delete
AFTER DELETE ON content_prodotti BEGIN
  DELETE FROM fts_prodotti WHERE entry_id = old.id;
END;


-- ─── team ─────────────────────────────────────────────────────────────────────
-- Was: no FTS. Now: name, role, bio, linkedIn, metaTitle, metaDescription

DROP TRIGGER IF EXISTS fts_team_insert;
DROP TRIGGER IF EXISTS fts_team_update;
DROP TRIGGER IF EXISTS fts_team_delete;
DROP TABLE IF EXISTS fts_team;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_team USING fts5(
  entry_id UNINDEXED,
  name,
  role,
  bio,
  linkedIn,
  metaTitle,
  metaDescription,
  tokenize = 'unicode61'
);

INSERT INTO fts_team(entry_id, name, role, bio, linkedIn, metaTitle, metaDescription)
SELECT id, name, role, bio, linkedIn, metaTitle, metaDescription FROM content_team;

CREATE TRIGGER IF NOT EXISTS fts_team_insert
AFTER INSERT ON content_team BEGIN
  INSERT INTO fts_team(entry_id, name, role, bio, linkedIn, metaTitle, metaDescription)
  VALUES (new.id, new.name, new.role, new.bio, new.linkedIn, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_team_update
AFTER UPDATE OF name, role, bio, linkedIn, metaTitle, metaDescription ON content_team BEGIN
  DELETE FROM fts_team WHERE entry_id = old.id;
  INSERT INTO fts_team(entry_id, name, role, bio, linkedIn, metaTitle, metaDescription)
  VALUES (new.id, new.name, new.role, new.bio, new.linkedIn, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_team_delete
AFTER DELETE ON content_team BEGIN
  DELETE FROM fts_team WHERE entry_id = old.id;
END;


-- ─── testimonianze ────────────────────────────────────────────────────────────
-- Was: no FTS. Now: author, company, quote, metaTitle, metaDescription

DROP TRIGGER IF EXISTS fts_testimonianze_insert;
DROP TRIGGER IF EXISTS fts_testimonianze_update;
DROP TRIGGER IF EXISTS fts_testimonianze_delete;
DROP TABLE IF EXISTS fts_testimonianze;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_testimonianze USING fts5(
  entry_id UNINDEXED,
  author,
  company,
  quote,
  metaTitle,
  metaDescription,
  tokenize = 'unicode61'
);

INSERT INTO fts_testimonianze(entry_id, author, company, quote, metaTitle, metaDescription)
SELECT id, author, company, quote, metaTitle, metaDescription FROM content_testimonianze;

CREATE TRIGGER IF NOT EXISTS fts_testimonianze_insert
AFTER INSERT ON content_testimonianze BEGIN
  INSERT INTO fts_testimonianze(entry_id, author, company, quote, metaTitle, metaDescription)
  VALUES (new.id, new.author, new.company, new.quote, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_testimonianze_update
AFTER UPDATE OF author, company, quote, metaTitle, metaDescription ON content_testimonianze BEGIN
  DELETE FROM fts_testimonianze WHERE entry_id = old.id;
  INSERT INTO fts_testimonianze(entry_id, author, company, quote, metaTitle, metaDescription)
  VALUES (new.id, new.author, new.company, new.quote, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_testimonianze_delete
AFTER DELETE ON content_testimonianze BEGIN
  DELETE FROM fts_testimonianze WHERE entry_id = old.id;
END;


-- ─── pagine ───────────────────────────────────────────────────────────────────
-- Was: body only. Now: title, body, metaTitle, metaDescription

DROP TRIGGER IF EXISTS fts_pagine_insert;
DROP TRIGGER IF EXISTS fts_pagine_update;
DROP TRIGGER IF EXISTS fts_pagine_delete;
DROP TABLE IF EXISTS fts_pagine;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_pagine USING fts5(
  entry_id UNINDEXED,
  title,
  body,
  metaTitle,
  metaDescription,
  tokenize = 'unicode61'
);

INSERT INTO fts_pagine(entry_id, title, body, metaTitle, metaDescription)
SELECT id, title, body, metaTitle, metaDescription FROM content_pagine;

CREATE TRIGGER IF NOT EXISTS fts_pagine_insert
AFTER INSERT ON content_pagine BEGIN
  INSERT INTO fts_pagine(entry_id, title, body, metaTitle, metaDescription)
  VALUES (new.id, new.title, new.body, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_pagine_update
AFTER UPDATE OF title, body, metaTitle, metaDescription ON content_pagine BEGIN
  DELETE FROM fts_pagine WHERE entry_id = old.id;
  INSERT INTO fts_pagine(entry_id, title, body, metaTitle, metaDescription)
  VALUES (new.id, new.title, new.body, new.metaTitle, new.metaDescription);
END;

CREATE TRIGGER IF NOT EXISTS fts_pagine_delete
AFTER DELETE ON content_pagine BEGIN
  DELETE FROM fts_pagine WHERE entry_id = old.id;
END;


-- ─── clienti ──────────────────────────────────────────────────────────────────
-- Was: no FTS (no richtext). Now: name, tier, phone (email/passwordHash/internalNote excluded via search:false)

DROP TRIGGER IF EXISTS fts_clienti_insert;
DROP TRIGGER IF EXISTS fts_clienti_update;
DROP TRIGGER IF EXISTS fts_clienti_delete;
DROP TABLE IF EXISTS fts_clienti;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_clienti USING fts5(
  entry_id UNINDEXED,
  name,
  tier,
  phone,
  tokenize = 'unicode61'
);

INSERT INTO fts_clienti(entry_id, name, tier, phone)
SELECT id, name, tier, phone FROM content_clienti;

CREATE TRIGGER IF NOT EXISTS fts_clienti_insert
AFTER INSERT ON content_clienti BEGIN
  INSERT INTO fts_clienti(entry_id, name, tier, phone)
  VALUES (new.id, new.name, new.tier, new.phone);
END;

CREATE TRIGGER IF NOT EXISTS fts_clienti_update
AFTER UPDATE OF name, tier, phone ON content_clienti BEGIN
  DELETE FROM fts_clienti WHERE entry_id = old.id;
  INSERT INTO fts_clienti(entry_id, name, tier, phone)
  VALUES (new.id, new.name, new.tier, new.phone);
END;

CREATE TRIGGER IF NOT EXISTS fts_clienti_delete
AFTER DELETE ON content_clienti BEGIN
  DELETE FROM fts_clienti WHERE entry_id = old.id;
END;


-- ─── messaggi ─────────────────────────────────────────────────────────────────
-- Was: message (richtext) only. Now: name, email, subject, message

DROP TRIGGER IF EXISTS fts_messaggi_insert;
DROP TRIGGER IF EXISTS fts_messaggi_update;
DROP TRIGGER IF EXISTS fts_messaggi_delete;
DROP TABLE IF EXISTS fts_messaggi;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_messaggi USING fts5(
  entry_id UNINDEXED,
  name,
  email,
  subject,
  message,
  tokenize = 'unicode61'
);

INSERT INTO fts_messaggi(entry_id, name, email, subject, message)
SELECT id, name, email, subject, message FROM content_messaggi;

CREATE TRIGGER IF NOT EXISTS fts_messaggi_insert
AFTER INSERT ON content_messaggi BEGIN
  INSERT INTO fts_messaggi(entry_id, name, email, subject, message)
  VALUES (new.id, new.name, new.email, new.subject, new.message);
END;

CREATE TRIGGER IF NOT EXISTS fts_messaggi_update
AFTER UPDATE OF name, email, subject, message ON content_messaggi BEGIN
  DELETE FROM fts_messaggi WHERE entry_id = old.id;
  INSERT INTO fts_messaggi(entry_id, name, email, subject, message)
  VALUES (new.id, new.name, new.email, new.subject, new.message);
END;

CREATE TRIGGER IF NOT EXISTS fts_messaggi_delete
AFTER DELETE ON content_messaggi BEGIN
  DELETE FROM fts_messaggi WHERE entry_id = old.id;
END;
