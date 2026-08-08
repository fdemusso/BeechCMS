# Execution Log — Sprint 3: Context-Aware API Filtering

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `ActorContext` interface defined in `@beechcms/core` with `'public' | 'authenticated' | 'system'` types.
- [x] `filterEntryForActor` correctly omits `Internal` and `Confidential` fields when `actor.type === 'public'`.
- [x] `filterEntryForActor` correctly includes `Internal` and `Confidential` fields when `actor.type === 'authenticated'`.
- [x] `filterEntryForActor` ALWAYS omits `Restricted` fields for both `public` and `authenticated` actors (`Restricted` fields are scrubbed from all API endpoints).
- [x] System actor (`actor.type === 'system'`) retains full access to all fields for internal orchestration.
- [x] `applyPublicPolicies` in `apps/api/src/public/entry-projection.ts` delegates to `filterEntryForActor(data, seed, { type: 'public' })`.
- [x] `applyVisibility` in `apps/api/src/shared/policies/apply-policies.ts` accepts an optional `ActorContext`.
- [x] All unit and integration tests across `@beechcms/core` and `apps/api` pass with 0 typecheck or build errors.

## Validation Output

### `@beechcms/core` Build (`pnpm --filter @beechcms/core run build`)
```
> tsc
Exit status: 0 (Clean build)
```

### `@beechcms/core` Test (`pnpm --filter @beechcms/core test`)
```
Test Files  28 passed (28)
     Tests  572 passed (572)
  Duration  1.05s
Exit status: 0
```

### `apps/api` Typecheck (`npx tsc --noEmit` in `apps/api/`)
```
Exit status: 0 (0 errors)
```

### `apps/api` Test (`pnpm --filter api test`)
```
Test Files  100 passed (100)
     Tests  1188 passed (1188)
  Duration  10.33s
Exit status: 0
```

### Graph Sync (`graphify update .`)
```
Rebuilt: 11386 nodes, 16979 edges, 2823 communities
Code graph updated.
Exit status: 0
```
