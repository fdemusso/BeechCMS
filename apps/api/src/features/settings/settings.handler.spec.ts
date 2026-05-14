import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { settingsApp } from './settings.handler';
import type { SettingsRepository, DashboardConfig } from '@beechcms/core';
import type { Env, Variables } from '../../types';

function createStubSettingsRepository(): SettingsRepository & { store: DashboardConfig | null, throws: boolean } {
  return {
    store: null,
    throws: false,
    async getDashboardConfig() {
      if (this.throws) throw new Error('Repository error');
      return this.store;
    },
    async putDashboardConfig(config: DashboardConfig) {
      if (this.throws) throw new Error('Repository error');
      this.store = config;
    }
  };
}

function createTestApp(stub: SettingsRepository) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  // Middleware override pattern
  app.use('*', async (c, next) => {
    c.set('settingsRepository', stub);
    await next();
  });
  app.route('/api/settings', settingsApp);
  return app;
}

describe('Settings Handler (Integration)', () => {
  let stub: ReturnType<typeof createStubSettingsRepository>;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    stub = createStubSettingsRepository();
    app = createTestApp(stub);
  });

  describe('GET /api/settings/dashboard', () => {
    it('1. Fresh state → 200 with null data', async () => {
      stub.store = null;
      const res = await app.request('/api/settings/dashboard');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ data: null });
    });

    it('2. Existing config → 200 with config', async () => {
      stub.store = { layout: 'grid', widgets: ['chart'] };
      const res = await app.request('/api/settings/dashboard');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ data: { layout: 'grid', widgets: ['chart'] } });
    });

    it('3. Repository throws → 500', async () => {
      stub.throws = true;
      const res = await app.request('/api/settings/dashboard');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/settings/dashboard', () => {
    it('4. Valid payload → 200', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: 'grid', widgets: [] })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });

    it('5. Valid payload is actually persisted', async () => {
      await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: 'bento', widgets: [] })
      });
      const res = await app.request('/api/settings/dashboard');
      const body = await res.json();
      expect(body).toEqual({ data: { layout: 'bento', widgets: [] } });
    });

    it('6. Payload is a string, not an object → 400', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('just a string')
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('7. Payload is an array → 400', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([1, 2, 3])
      });
      expect(res.status).toBe(400);
    });

    it('8. Payload is null → 400', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null)
      });
      expect(res.status).toBe(400);
    });

    it('9. Payload is a number → 400', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(42)
      });
      expect(res.status).toBe(400);
    });

    it('10. No Content-Type header → 400 or 415', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        body: JSON.stringify({ layout: 'grid' })
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('11. Empty object → 200 (edge case: empty object IS a valid DashboardConfig)', async () => {
      const res = await app.request('/api/settings/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(200);
    });
  });
});
