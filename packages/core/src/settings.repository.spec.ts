import { describe, it } from 'vitest';
import type { SettingsRepository, DashboardConfig } from './index.js';

describe('SettingsRepository (Type Contract)', () => {
  it('should export SettingsRepository and DashboardConfig from index', () => {
    // This is purely a type-level check. If it compiles, the imports work.
    const _testExport1: SettingsRepository | undefined = undefined;
    const _testExport2: DashboardConfig | undefined = undefined;
  });

  it('SettingsRepository should strictly require getDashboardConfig and putDashboardConfig', () => {
    // Correct implementation
    class ValidRepo implements SettingsRepository {
      async getDashboardConfig(): Promise<DashboardConfig | null> {
        return null;
      }
      async putDashboardConfig(_config: DashboardConfig): Promise<void> {
        return;
      }
    }

    // Missing putDashboardConfig
    // @ts-expect-error
    class InvalidRepo1 implements SettingsRepository {
      async getDashboardConfig(): Promise<DashboardConfig | null> {
        return null;
      }
    }

    // Missing getDashboardConfig
    // @ts-expect-error
    class InvalidRepo2 implements SettingsRepository {
      async putDashboardConfig(_config: DashboardConfig): Promise<void> {
        return;
      }
    }

    // Wrong return type for getDashboardConfig
    class InvalidRepo3 implements SettingsRepository {
      // @ts-expect-error
      async getDashboardConfig(): Promise<string> {
        return 'not a config';
      }
      async putDashboardConfig(_config: DashboardConfig): Promise<void> {
        return;
      }
    }
  });
});
