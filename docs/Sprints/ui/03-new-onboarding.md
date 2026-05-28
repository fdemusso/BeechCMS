You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

This sprint covers **UI Refactoring — Sprint 03: Custom Onboarding & Developer Flow**.

Currently, the setup/onboarding page (`SetupPage`) is a basic form that takes a Name, Email, Password, and Confirm Password to create the initial admin user. It does not allow configuring site defaults (such as language, timezone, currency), nor does it provide a customized onboarding flow for local developers versus production instances.

This sprint introduces:
1. **Environment-Aware Onboarding**: Automatic detection of whether Beech is running on localhost (offering a Developer Setup) or online (offering a Normal User Setup).
2. **Three-Step Centered Modal**: A redesigned onboarding wizard with step indicators above that transition from a light gradient to a dark, premium gradient as the user progresses.
3. **Localized Settings**: Initial configuration of Language, Timezone, and Currency during Step 1.
4. **Credential Setup & Strength Indicator**: Name, Surname, Email, and Password setup in Step 2 with an animated, colored strength progress bar.
5. **Configuration Checklist & Company Metadata**: Step 3 tailored to the setup track:
   - *Developer track*: Displays available services checklist (Resend email, QStash, Docker) and a checkbox to load demo database content.
   - *Normal track*: Asks for Company Website link, Company Name, and optional Company Abbreviation.
6. **Dynamic Database Configuration Loader**: Emptying the modal and showing a loading progress bar during account creation and DB seeding.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS
==========================================================================

1. **Tailored Local Dev Experience**: Developers starting BeechCMS on localhost want a quick setup that pre-checks available services and allows loading mock demo content with a single click.
2. **Production Readiness**: When deploying BeechCMS online, the onboarding should configure site-specific brand metadata (Company name/website) and set correct localization settings.
3. **Aesthetic & Animation Polish**: A high-fidelity step-by-step modal with micro-animations makes the first-time setup experience of BeechCMS feel premium and state of the art.

==========================================================================
SECTION 2 — CURRENT STATE & CODE REUSE
==========================================================================

1. **Setup Routes**:
   - Backend: `apps/api/src/features/setup/index.ts` exposes `GET /auth/setup` and `POST /auth/setup`.
   - Frontend: `apps/dashboard/src/pages/setup/SetupPage.tsx` handles the client setup.
2. **Site Settings**: `apps/api/src/features/settings/settings.handler.ts` exposes `GET /api/settings` returning hardcoded site configuration.
3. **Demo Data**: The SQL migration file `apps/api/migrations/0028_v040_seed_data.sql` contains the complete mock database inserts for content tables.
4. **Key-Value Store**: The `system_stats` table in SQLite is already a generic string key-value store, which is perfect for persisting site defaults.
5. **Shadcn UI & Reuse of Components**: All dashboard UI updates (inputs, dropdowns, indicators, buttons) must reuse existing Shadcn UI components located in `apps/dashboard/src/components/ui/` (such as `Button`, `Input`, `Label`, `Card`, `Checkbox`, `Select`, and `Progress`). No raw or unstyled inputs should be added.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

The sprint is divided into three phases:

- **Phase A — Backend: Dynamic Settings & Demo Seeding**
  - Update `GET /auth/setup` to return environmental availability flags (`mail`, `qstash`, `docker`).
  - Update `POST /auth/setup` to accept and validate the new payload fields.
  - Dynamically store setup choices in the `system_stats` table.
  - Gravatar fallback already implemented in Sprint 02: `settings.handler.ts` imports `sha256hex` from `@beechcms/core` and computes `https://gravatar.com/avatar/${emailHash}?d=mp` in `GET /me` when `avatarUrl` is null — custom avatars take precedence, untouched. `POST /auth/setup` only needs to store the user with `avatarUrl: null`; the fallback is resolved at read time.
  - Dynamically read and execute `0028_v040_seed_data.sql` statements using `DB.exec()` if the developer chooses to load demo data.
  - Make `GET /api/settings` retrieve values from `system_stats`.

- **Phase B — Frontend: Centered Modal & Multi-Step Wizard**
  - Rewrite `SetupPage.tsx` to center the modal and add step number indicators.
  - Implement gradient step number styling (transitioning from light to dark).
  - Add language, timezone, and currency dropdowns in Step 1.
  - Implement a developer setup alert box in Step 1 that lets users switch tracks via a toggle hyperlink.

- **Phase C — Password Strength, Service Check, and Loading State**
  - Add Surname (Cognome) field in Step 2.
  - Add password strength colored bar in Step 2.
  - Add environment checklist and demo checkbox in Step 3 for Developer mode.
  - Add company detail inputs in Step 3 for Normal mode.
  - Animate the submission step: empty the modal and render a loading progress bar while request is in-flight.

==========================================================================
SECTION 4 — PHASE DETAILS
==========================================================================

### Phase A — Backend: Dynamic Settings & Demo Seeding

#### Files to modify:
- [index.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api/src/features/setup/index.ts)
- [settings.handler.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api/src/features/settings/settings.handler.ts)

### Phase B — Frontend: Centered Modal & Multi-Step Wizard

#### Files to modify:
- [SetupPage.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/pages/setup/SetupPage.tsx)

---

### Phase C — Password Strength, Service Check, and Loading State

#### Files to modify:
- [SetupPage.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/pages/setup/SetupPage.tsx)

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

1. Run `npx tsc --noEmit` on both apps to verify type safety.
2. Run database reset and visit `/admin/setup`.
3. Test both the Developer flow (load demo data, verify env checks, check database for sample posts) and the Normal flow (verify company settings are applied, website link, site title changed dynamically).
