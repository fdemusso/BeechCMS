import { describe, it, expect, beforeEach } from 'vitest';
import { D1SettingsRepository } from './settings.repository.d1';
import type { D1Database } from '@cloudflare/workers-types';

describe('D1SettingsRepository', () => {
  let dbMock: any;
  let repo: D1SettingsRepository;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();

    // Mocking D1Database
    dbMock = {
      prepare: (query: string): any => {
        let boundParams: any[] = [];
        const statement = {
          bind: (...params: any[]) => {
            boundParams = params;
            return statement;
          },
          first: async <T = any>(): Promise<T | null> => {
            if (query.includes('SELECT value FROM dashboard_settings')) {
              const key = boundParams[0];
              const value = store.get(key);
              return value ? ({ value } as unknown as T) : null;
            }
            return null;
          },
          run: async (): Promise<any> => {
            if (query.includes('INSERT INTO dashboard_settings')) {
              const key = boundParams[0];
              const value = boundParams[1];
              store.set(key, value);
            }
            return { success: true };
          }
        };
        return statement;
      }
    };

    repo = new D1SettingsRepository(dbMock as unknown as D1Database);
  });

  it('1. getDashboardConfig — empty DB: should return null when no row exists', async () => {
    const result = await repo.getDashboardConfig();
    expect(result).toBeNull();
  });

  it('2. getDashboardConfig — valid persisted JSON: should return the parsed object', async () => {
    store.set('default', JSON.stringify({ layout: 'grid', widgets: [] }));
    const result = await repo.getDashboardConfig();
    expect(result).toEqual({ layout: 'grid', widgets: [] });
  });

  it('3. getDashboardConfig — corrupted blob: should return null WITHOUT throwing', async () => {
    store.set('default', 'NOT_VALID_JSON{{{');
    const result = await repo.getDashboardConfig();
    expect(result).toBeNull();
  });

  it('4. putDashboardConfig — first write', async () => {
    await repo.putDashboardConfig({ layout: 'grid', widgets: [] });
    const result = await repo.getDashboardConfig();
    expect(result).toEqual({ layout: 'grid', widgets: [] });
  });

  it('5. putDashboardConfig — overwrite: get should return the second config, not the first', async () => {
    await repo.putDashboardConfig({ layout: 'grid', widgets: [] });
    await repo.putDashboardConfig({ layout: 'list', widgets: ['chart'] });
    const result = await repo.getDashboardConfig();
    expect(result).toEqual({ layout: 'list', widgets: ['chart'] });
  });

  it('6. putDashboardConfig — complex nested config: get should return it with deep equality', async () => {
    const complexConfig = {
      layout: 'bento',
      theme: { mode: 'dark', colors: { primary: '#ff0000' } },
      widgets: [
        { id: 1, type: 'stat', config: { span: 2 } },
        { id: 2, type: 'chart', config: { series: [1, 2, 3] } }
      ]
    };
    await repo.putDashboardConfig(complexConfig);
    const result = await repo.getDashboardConfig();
    expect(result).toEqual(complexConfig);
  });
});
