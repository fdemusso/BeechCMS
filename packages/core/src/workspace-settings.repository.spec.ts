import { describe, it } from 'vitest';
import type { WorkspaceSettingsRepository } from './index.js';

describe('WorkspaceSettingsRepository (Type Contract)', () => {
  it('should export WorkspaceSettingsRepository from index', () => {
    // Purely a type-level check
    const _testExport: WorkspaceSettingsRepository | undefined = undefined;
  });

  it('WorkspaceSettingsRepository should strictly require get and set', () => {
    // Correct implementation
    class ValidRepo implements WorkspaceSettingsRepository {
      async get(_key: string): Promise<string | null> {
        return null;
      }
      async set(_key: string, _value: string): Promise<void> {
        return;
      }
    }

    // Missing set
    // @ts-expect-error
    class InvalidRepo1 implements WorkspaceSettingsRepository {
      async get(_key: string): Promise<string | null> {
        return null;
      }
    }

    // Missing get
    // @ts-expect-error
    class InvalidRepo2 implements WorkspaceSettingsRepository {
      async set(_key: string, _value: string): Promise<void> {
        return;
      }
    }

    // Wrong return type for get
    class InvalidRepo3 implements WorkspaceSettingsRepository {
      // @ts-expect-error
      async get(_key: string): Promise<number> {
        return 42;
      }
      async set(_key: string, _value: string): Promise<void> {
        return;
      }
    }

    // Wrong argument type for get
    class InvalidRepo4 implements WorkspaceSettingsRepository {
      // @ts-expect-error
      async get(_key: number): Promise<string | null> {
        return null;
      }
      async set(_key: string, _value: string): Promise<void> {
        return;
      }
    }

    // Wrong argument type for set
    class InvalidRepo5 implements WorkspaceSettingsRepository {
      async get(_key: string): Promise<string | null> {
        return null;
      }
      // @ts-expect-error
      async set(_key: string, _value: number): Promise<void> {
        return;
      }
    }
  });
});
