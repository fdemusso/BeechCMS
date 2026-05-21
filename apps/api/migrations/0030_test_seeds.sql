  -- content_products
CREATE TABLE IF NOT EXISTS content_products (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  name  TEXT NOT NULL,
  description  TEXT,
  price  REAL,
  inventory  REAL,
  rating  REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_products_status ON content_products(status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON content_products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_name ON content_products(name);
CREATE INDEX IF NOT EXISTS idx_products_price ON content_products(price);
CREATE INDEX IF NOT EXISTS idx_products_inventory ON content_products(inventory);
CREATE INDEX IF NOT EXISTS idx_products_rating ON content_products(rating);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_products USING fts5(
  entry_id UNINDEXED,
  name,
  description,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS fts_products_insert
AFTER INSERT ON content_products BEGIN
  INSERT INTO fts_products(entry_id, name, description) VALUES (new.id, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS fts_products_update
AFTER UPDATE OF name, description ON content_products BEGIN
  DELETE FROM fts_products WHERE entry_id = old.id;
  INSERT INTO fts_products(entry_id, name, description) VALUES (new.id, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS fts_products_delete
AFTER DELETE ON content_products BEGIN
  DELETE FROM fts_products WHERE entry_id = old.id;
END;

  -- content_reviews
CREATE TABLE IF NOT EXISTS content_reviews (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title  TEXT NOT NULL,
  body  TEXT,
  score  REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON content_reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON content_reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON content_reviews(title);
CREATE INDEX IF NOT EXISTS idx_reviews_body ON content_reviews(body);
CREATE INDEX IF NOT EXISTS idx_reviews_score ON content_reviews(score);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_reviews USING fts5(
  entry_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS fts_reviews_insert
AFTER INSERT ON content_reviews BEGIN
  INSERT INTO fts_reviews(entry_id, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS fts_reviews_update
AFTER UPDATE OF title, body ON content_reviews BEGIN
  DELETE FROM fts_reviews WHERE entry_id = old.id;
  INSERT INTO fts_reviews(entry_id, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS fts_reviews_delete
AFTER DELETE ON content_reviews BEGIN
  DELETE FROM fts_reviews WHERE entry_id = old.id;
END;

  -- content_tasks
CREATE TABLE IF NOT EXISTS content_tasks (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title  TEXT NOT NULL,
  taskStatus  TEXT,
  completion  REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON content_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON content_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_title ON content_tasks(title);
CREATE INDEX IF NOT EXISTS idx_tasks_taskStatus ON content_tasks(taskStatus);
CREATE INDEX IF NOT EXISTS idx_tasks_completion ON content_tasks(completion);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_tasks USING fts5(
  entry_id UNINDEXED,
  title,
  taskStatus,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS fts_tasks_insert
AFTER INSERT ON content_tasks BEGIN
  INSERT INTO fts_tasks(entry_id, title, taskStatus) VALUES (new.id, new.title, new.taskStatus);
END;

CREATE TRIGGER IF NOT EXISTS fts_tasks_update
AFTER UPDATE OF title, taskStatus ON content_tasks BEGIN
  DELETE FROM fts_tasks WHERE entry_id = old.id;
  INSERT INTO fts_tasks(entry_id, title, taskStatus) VALUES (new.id, new.title, new.taskStatus);
END;

CREATE TRIGGER IF NOT EXISTS fts_tasks_delete
AFTER DELETE ON content_tasks BEGIN
  DELETE FROM fts_tasks WHERE entry_id = old.id;
END;
