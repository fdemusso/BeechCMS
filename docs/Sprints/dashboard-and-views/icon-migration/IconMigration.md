### Pre-Computation Analysis
a) "God Nodes": `src_lib_icon_registry` was evaluated via `graphify explain`. It serves as the central mapping for dynamically rendered icons. The `lucide-react` library itself acts as a third-party god dependency spread across ~120+ components.
b) Boundaries: This sprint operates exclusively within the boundary of `apps/dashboard`. There is zero impact on `@beechcms/core` or `apps/api`.
c) Impact: `graphify affected "Icon Registry"` yielded no strict D1 schema or API endpoint breaks. `grep` confirmed `lucide-react` and `@radix-ui/react-icons` are statically imported across `src/components`, `src/features`, and `src/config`, meaning a mass string-replacement and dependency swap is required, but business logic (routing, API calls, rendering) is unaffected.

### VETO Audit
- VSA Enforcement: We are swapping a third-party library inside `apps/dashboard`. We are not creating new cross-feature dependencies or shared abstractions (no `<Icon />` wrapper). This is fully compliant with Vertical Slice Architecture.
- Botanical Invariant: No database queries or core logic are modified.
- Verdict: PASS. Proceeding with single-sprint plan.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Replacing `lucide-react` and `@radix-ui/react-icons` with `reicon-react` across `apps/dashboard` unifies the visual identity and reduces bundle bloat (two icon libraries instead of one). By replacing these imports directly without a wrapper component, we abide by YAGNI and the Vertical Slice Architecture, ensuring each component explicitly controls its own icon dependencies.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
Currently, `apps/dashboard` uses `lucide-react` as the primary icon set (e.g., `Folder`, `Settings`, `ChevronDown`) across UI elements, automations, and `icon-registry.ts`. The rich-text editor (`minimal-tiptap`) relies on `@radix-ui/react-icons`. `icon-registry.ts` exposes a `resolveIcon` function and `ICON_NAMES` array which maps string keys to `lucide-react` icons. 

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- Modified `apps/dashboard/package.json` to add `reicon-react` and remove `lucide-react` and `@radix-ui/react-icons`.
- Modified `apps/dashboard/src/lib/icon-registry.ts` to map string keys to `reicon-react` icons while preserving the `resolveIcon` signature.
- Modified `apps/dashboard/src/test/lib/icon-registry.test.ts` to update the imports and type checks if needed.
- Modified all `apps/dashboard/src/**/*.tsx` and `*.ts` files that import from `lucide-react` or `@radix-ui/react-icons` to import visually similar icons directly from `reicon-react`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Dependency Update:**
   - In `apps/dashboard/package.json`: Remove `lucide-react` and `@radix-ui/react-icons`. Add `reicon-react` to `dependencies`.

2. **Registry Migration:**
   - Update `apps/dashboard/src/lib/icon-registry.ts`:
     - Replace `import type { LucideIcon } from 'lucide-react'` with the appropriate generic React component type (e.g., `import type { ComponentType, SVGProps } from 'react'` and define an alias `type IconType = ComponentType<SVGProps<SVGSVGElement>>`).
     - Replace all `lucide-react` imports with equivalent icons from `reicon-react`. If an exact 1:1 name match does not exist, use the most visually/conceptually similar Reicon.
     - Ensure `resolveIcon` signature (`name?: string`) remains identical and returns the `Folder` equivalent from Reicon as default.
   - Update `apps/dashboard/src/test/lib/icon-registry.test.ts`:
     - Validate that the component type assertions are still valid (usually functions or objects for React components).

3. **Global Import Replacement:**
   - Find all files in `apps/dashboard/src` importing from `lucide-react` and `@radix-ui/react-icons`.
   - For every import statement, map it to a `reicon-react` icon.
   - Update `className` props on icons only if specifically required for Tailwind utility compatibility, otherwise preserve the existing props (`size-4`, `text-muted-foreground`, etc.).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm install` (at workspace root)
- `pnpm run build` in `apps/dashboard/`
- `pnpm run type-check` in `apps/dashboard/` (or `npx tsc -b`)
- `pnpm beech test --diff`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `lucide-react` and `@radix-ui/react-icons` are entirely removed from `apps/dashboard/package.json`.
- [ ] `reicon-react` is successfully added to `apps/dashboard/package.json`.
- [ ] All instances of icon imports across `apps/dashboard/src` now point to `reicon-react`.
- [ ] `icon-registry.ts` exposes the identical API surface (returns a React component, uses string keys).
- [ ] `apps/dashboard` passes type-check (`tsc -b`).
- [ ] `apps/dashboard` passes tests.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Do NOT create a custom `<Icon />` wrapper component.
- Do NOT attempt to alter the D1 schema, core packages, or any API logic.
- Do NOT add fallback code for old icons if they are missing; complete the migration directly.
