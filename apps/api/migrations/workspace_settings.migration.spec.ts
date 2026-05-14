import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Migration: 0030_workspace_settings', () => {
  let db: ReturnType<typeof Database>;
  let migrationSql: string;

  beforeEach(() => {
    // Create an in-memory SQLite database for testing the schema
    db = new Database(':memory:');
    
    // Read the migration SQL file
    const migrationPath = resolve(__dirname, '0030_workspace_settings.sql');
    migrationSql = readFileSync(migrationPath, 'utf8');
  });

  afterEach(() => {
    db.close();
  });

  it('Migration runs without errors', () => {
    expect(() => {
      db.exec(migrationSql);
    }).not.toThrow();
  });

  it('Table exists after migration', () => {
    db.exec(migrationSql);
    const row = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_settings'
    `).get();
    expect(row).toBeDefined();
    expect(row).toHaveProperty('name', 'workspace_settings');
  });

  it('Table has correct columns', () => {
    db.exec(migrationSql);
    const columns = db.prepare(`PRAGMA table_info(workspace_settings)`).all() as any[];
    
    const keyCol = columns.find(c => c.name === 'key');
    expect(keyCol).toBeDefined();
    expect(keyCol.type).toBe('TEXT');
    expect(keyCol.pk).toBe(1);

    const valueCol = columns.find(c => c.name === 'value');
    expect(valueCol).toBeDefined();
    expect(valueCol.type).toBe('TEXT');
    expect(valueCol.notnull).toBe(1);

    const updatedAtCol = columns.find(c => c.name === 'updated_at');
    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol.type).toBe('INTEGER');
    expect(updatedAtCol.notnull).toBe(1);
  });

  it('Migration is idempotent', () => {
    expect(() => {
      // First run
      db.exec(migrationSql);
      // Second run
      db.exec(migrationSql);
    }).not.toThrow();
  });

  it('key is PRIMARY KEY — no duplicates', () => {
    db.exec(migrationSql);
    const insert = db.prepare(`INSERT INTO workspace_settings (key, value) VALUES (?, ?)`);
    
    // Insert first row should succeed
    insert.run('test-key', 'value-1');
    
    // Insert second row with same key should throw unique constraint error
    expect(() => {
      insert.run('test-key', 'value-2');
    }).toThrow(/UNIQUE constraint failed: workspace_settings.key/);
  });

  it('updated_at is set automatically', () => {
    db.exec(migrationSql);
    const insert = db.prepare(`INSERT INTO workspace_settings (key, value) VALUES (?, ?)`);
    insert.run('test-key', 'value-1');

    const row = db.prepare(`SELECT updated_at FROM workspace_settings WHERE key = ?`).get('test-key') as any;
    expect(row).toBeDefined();
    expect(row.updated_at).toBeGreaterThan(0);
    expect(typeof row.updated_at).toBe('number');
  });

  it('value NOT NULL is enforced', () => {
    db.exec(migrationSql);
    const insert = db.prepare(`INSERT INTO workspace_settings (key, value) VALUES (?, ?)`);
    
    expect(() => {
      insert.run('test-key', null);
    }).toThrow(/NOT NULL constraint failed: workspace_settings.value/);
  });
});
