import type { D1Database } from '@cloudflare/workers-types';
import type { SettingsRepository, DashboardConfig } from '@beechcms/core';

const TABLE = 'dashboard_settings';
const ROW_KEY = 'default';

export class D1SettingsRepository implements SettingsRepository {
  constructor(private db: D1Database) {}

  async getDashboardConfig(): Promise<DashboardConfig | null> {
    const row = await this.db
      .prepare(`SELECT value FROM ${TABLE} WHERE key = ?`)
      .bind(ROW_KEY)
      .first<{ value: string }>();

    if (!row) return null;

    try {
      return JSON.parse(row.value) as DashboardConfig;
    } catch {
      // invalid persisted blob → return null (safe fallback)
      return null;
    }
  }

  async putDashboardConfig(config: DashboardConfig): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO ${TABLE} (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .bind(ROW_KEY, JSON.stringify(config))
      .run();
  }
}
