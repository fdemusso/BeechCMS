## SECTION 6 — ACCEPTANCE CRITERIA
- [x] `lucide-react` and `@radix-ui/react-icons` are entirely removed from `apps/dashboard/package.json`.
- [x] `reicon-react` is successfully added to `apps/dashboard/package.json`.
- [x] All instances of icon imports across `apps/dashboard/src` now point to `reicon-react`.
- [x] `icon-registry.ts` exposes the identical API surface (returns a React component, uses string keys).
- [x] `apps/dashboard` passes type-check (`tsc -b`).
- [x] `apps/dashboard` passes tests.

## VALIDATION OUTPUT
```
$ pnpm install
Done in 21.8s using pnpm v11.5.2

$ pnpm run build (apps/dashboard)
✓ built in 1.25s

$ pnpm run type-check (apps/dashboard)
$ tsc -b
(clean - 0 errors)

$ pnpm vitest run --fileParallelism=false (apps/dashboard - sequential low-RAM execution)
 Test Files  98 passed (98)
      Tests  738 passed (738)

$ graphify update .
[graphify] Graph update complete! Saved to graphify-out
```
