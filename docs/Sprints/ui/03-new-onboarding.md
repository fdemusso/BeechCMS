# UI Refactoring — Sprint 03: Custom Onboarding & Developer Flow

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is in this
> document. You should not have to grep the codebase to discover signatures,
> schemas, or wiring — they are reproduced inline. If you do find a discrepancy
> between this doc and the live code, trust the live code and note the drift.

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo** (Turborepo).

Hard rules that override any default behavior:

1. **Cloudflare Workers runtime.** `apps/api` runs on the Workers runtime. There is
   **no filesystem at runtime** — you cannot `fs.readFile` a `.sql` file inside a
   handler. Any SQL that must run at request time must be a compiled-in TypeScript
   string/module.
2. **Repository pattern is mandatory.** Handlers never touch `context.env.DB`
   directly. All persistence goes through a repository interface declared in
   `@beechcms/core`, implemented under `apps/api/src/shared/*.repository.d1.ts`,
   constructed in `apps/api/src/middleware/repository.middleware.ts`, exposed on the
   Hono context via `Variables`, and read with `context.get('<name>Repository')`.
3. **i18n is mandatory in the dashboard.** No hardcoded UI strings. Every visible
   string goes through `t('section.key')` and must be added to **both**
   `apps/dashboard/src/locales/it.json` and `en.json`. Single namespace `translation`.
4. **Reuse existing Shadcn UI components** from `apps/dashboard/src/components/ui/`.
   No raw `<input>`/`<select>`. The components you need already exist (see §6).
5. **Docs are English.** This file stays in English.
6. **Beta DB.** The local D1 database can be wiped and recreated freely
   (`npm run db:reset:local` in `apps/api/`). You may add new migrations and edit the
   base migration. Prefer adding a new numbered migration; editing `0000_v040_base.sql`
   is acceptable for the schema changes in this sprint since the DB is disposable.

---

## 1. WHAT THIS SPRINT BUILDS

Today, onboarding (`SetupPage`) is one flat form: Name, Email, Password, Confirm →
creates the first admin user. It cannot configure site defaults and offers no
distinction between a local developer setup and a production setup.

This sprint delivers:

1. **Environment-aware onboarding** — the backend tells the frontend whether Beech is
   running in a developer environment so the wizard can offer a *Developer track* vs a
   *Normal track*.
2. **Three-step centered modal wizard** with step indicators whose styling transitions
   from a light gradient to a dark/premium gradient as the user advances.
3. **Localized site defaults** — Language, Timezone, Currency chosen in Step 1 and
   **persisted in the database** (no longer hardcoded / read from env vars).
4. **Credential setup + password strength** — Name, **Surname**, Email, Password in
   Step 2 with an animated colored strength bar.
5. **Step 3, track-dependent:**
   - *Developer track:* a checklist of detected services (mail, QStash) + a checkbox
     to load demo database content.
   - *Normal track:* Company Website, Company Name, optional Company Abbreviation.
6. **Loading state** — on submit, empty the modal and show a progress bar while the
   account is created and (dev track) demo data is seeded.

---

## 2. CONFIRMED DESIGN DECISIONS (do not re-litigate)

These four decisions were made by the product owner. Implement them as written.

### D1 — Site defaults move to the DB behind a typed repository
The existing `SystemStatsRepository` is **only** a storage-byte counter — it is *not* a
generic key-value store. Do **not** abuse it.

- Introduce a **dedicated `site_settings` table** and a new **`ISiteSettingsRepository`**
  interface in `@beechcms/core`, with a D1 implementation.
- From now on, `GET /api/settings` reads site config (site title, default language,
  timezone, currency, company metadata) **from the database**, not from env vars.
  `dateFormat` may keep an env fallback but should prefer the stored value.
- `POST /auth/setup` writes the chosen defaults into `site_settings`.

### D2 — Add a real `surname` column
Add `surname` to the `users` table and thread it through the type chain
(`UserRecord`, `NewUserInput`, `D1UserRepository.create`, `rowToRecord`,
`updateProfile`) and the settings profile endpoint. Surname must be independently
stored and retrievable — do **not** concatenate it into `name`.

### D3 — Demo seed is compiled-in SQL behind a repository method
Because Workers have no runtime FS, the demo dataset currently in
`apps/api/migrations/0028_v040_seed_data.sql` must become a **TypeScript string
constant compiled into the Worker bundle**, executed by a dedicated repository method
(e.g. `loadDemoData()`). The handler calls `repo.loadDemoData()`; the repo runs the
statements via D1. The SQL content stays coherent with the v0.4.0 per-seed table
schema (`content_articoli`, `content_team`, …).

### D4 — Developer detection via `ENV`, drop Docker
- Developer track is offered when `context.env.ENV === 'development'`.
- Service flags returned to the frontend: `mail` (true when an email provider is
  configured) and `qstash` (true when `QSTASH_TOKEN` is set).
- **Drop the Docker check entirely** — a Worker cannot detect Docker. Do not add a
  Docker flag anywhere.

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 Backend setup routes — `apps/api/src/features/setup/index.ts`
Mounted in `factory.ts` via `app.route('/', setupApp)` (public, pre-auth).

```ts
setupApp.get('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()
  return context.json({ needsSetup: userCount === 0 })
})

setupApp.post('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()
  if (userCount > 0) {
    return publicProblem(context, { type: 'setup-already-done', title: 'Setup already completed', status: 403, detail: '…' })
  }
  // parse JSON body → 400 on failure
  const { email, password, name } = payload as Record<string, unknown>
  // validate email regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ → 422
  // validate password length 8..128 → 422
  const passwordHash = await context.get('hashProvider').hash(password)
  await context.get('userRepository').create({
    id: context.get('idGenerator').uuid(),
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
    name: normalizedName,
  })
  return context.json({ success: true }, 201)
})
```
Error responses use `publicProblem(context, { type, title, status, detail })` (RFC 7807).

### 3.2 Settings handler — `apps/api/src/features/settings/settings.handler.ts`
Mounted at `apiProtected.route('/settings', settingsApp)` (JWT-protected). Current
`GET /` returns **hardcoded** config:

```ts
settingsApp.get('/', async (context) => {
  return context.json({
    siteTitle: 'Beech CMS',
    siteLogo: '/beechLogoDark.svg',
    defaultLanguage: 'it',
    dateFormat: context.env.DATE_FORMAT || 'DD-MM-YYYY',
    features: {
      drafts: true, media: true, search: true, activityLog: true,
      email: context.env.EMAIL_PROVIDER === 'smtp' || !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY),
    }
  })
})
```
Also relevant in this file:
- `GET /me` already implements the **Gravatar fallback** (see §3.6) — do not touch its
  avatar logic.
- `PUT /profile` updates `name`/`email`. You will extend it to also accept `surname`.

### 3.3 Frontend — `apps/dashboard/src/pages/setup/SetupPage.tsx`
Single `<Card>` with `name/email/password/confirm` state, client-side checks
(`password !== confirm`, `length < 8`), `axios.post('/auth/setup', { email, password, name })`,
then `navigate('/login')`. Imports `Button, Input, Label, Card*` from `@/components/ui/*`.
This file is **fully rewritten** in Phases B/C.

### 3.4 User repository — `apps/api/src/shared/d1-user.repository.ts`
Implements `IUserRepository` from `@beechcms/core`. Current row type and create:

```ts
type UserRow = { id; email; name|null; password_hash; role; avatar_url|null; notification_prefs }
function rowToRecord(row) { return { id, email, name, passwordHash: row.password_hash, role, avatarUrl: row.avatar_url, notificationPreferences: row.notification_prefs } }

async create(user: NewUserInput): Promise<void> {
  await this.db.prepare('INSERT INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, user.email, user.passwordHash, user.role, user.name).run()
}
```

### 3.5 Core user types — `packages/core/src/auth/user.repository.ts`
```ts
export interface UserRecord  { id; email; name: string|null; passwordHash; role; avatarUrl: string|null; notificationPreferences: string }
export interface NewUserInput { id; email; passwordHash; role; name: string|null }
export interface IUserRepository { countAll; findById; findByEmail; create(NewUserInput); updateProfile(userId,{name?,email?}); updatePasswordHash; updateAvatarUrl; updateNotificationPreferences; emailBelongsToAnotherUser }
```

### 3.6 Gravatar (already done in Sprint 02 — context only, no work)
`settings.handler.ts` imports `sha256hex` from `@beechcms/core`. In `GET /me`, when
`avatarUrl` is null it computes `https://gravatar.com/avatar/${sha256hex(email)}?d=mp`.
Custom avatars take precedence. **`POST /auth/setup` only needs to create the user with
`avatar_url` left null** — the fallback resolves at read time. No change required here.

### 3.7 DB schema — `apps/api/migrations/0000_v040_base.sql`
```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor')),
    name TEXT,
    avatar_url TEXT,
    notification_prefs TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS system_stats (
    id TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO system_stats (id, value) VALUES ('total_storage_bytes', '0');
```

### 3.8 Repository wiring — `apps/api/src/middleware/repository.middleware.ts`
Every repo is constructed here with `const database = context.env.DB` and set on the
context. Pattern to copy when adding a new repository:

```ts
import { D1SiteSettingsRepository } from '../shared/site-settings.repository.d1'   // NEW
// inside repositoryMiddleware:
context.set('siteSettingsRepository', overrides?.siteSettingsRepository ?? new D1SiteSettingsRepository(database))
```
There is also a `RepositoryOverrides` interface in this file — add the optional field
there too (used by tests to inject fakes).

### 3.9 Context typing — `apps/api/src/types.ts`
- `Env` includes: `DB: D1Database`, `ENV?: string`, `DATE_FORMAT?: string`,
  `EMAIL_PROVIDER?: string`, `EMAIL_API_KEY?: string`, `RESEND_API_KEY?: string`,
  `QSTASH_TOKEN?: string`.
- `Variables` lists every repository getter (e.g. `userRepository: IUserRepository`,
  `systemStatsRepository: SystemStatsRepository`). **Add `siteSettingsRepository:
  ISiteSettingsRepository` here.**

### 3.10 Env values (dev) — `apps/api/wrangler.jsonc` `vars`
`ENV: "development"`, `EMAIL_PROVIDER: "smtp"`, `DATE_FORMAT: "DD-MM-YYYY"`.
`QSTASH_TOKEN` is **not** set in dev (so `qstash` flag = false locally unless added to
`.dev.vars`).

---

## 4. PHASE A — BACKEND

### A1. Schema: add `surname` + create `site_settings`
Edit `apps/api/migrations/0000_v040_base.sql` (DB is disposable):

```sql
-- users: add surname after name
... name TEXT,
    surname TEXT,
    avatar_url TEXT, ...

-- new table
CREATE TABLE IF NOT EXISTS site_settings (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
```
> **OPEN Q (A1):** prefer editing `0000_v040_base.sql`, or add a new
> `0031_site_settings.sql` migration? Default assumption if unanswered: **add a new
> migration `0031_site_settings.sql`** for `site_settings`, but add the `surname`
> column inline in `0000` (simplest, DB is wiped). Confirm if you disagree.

### A2. Core: `ISiteSettingsRepository`
New file `packages/core/src/site-settings.repository.ts` (export it from the core
barrel, typically `packages/core/src/index.ts`):

```ts
export interface SiteSettings {
  siteTitle: string
  defaultLanguage: string   // e.g. 'it' | 'en'
  timezone: string          // IANA, e.g. 'Europe/Rome'
  currency: string          // ISO 4217, e.g. 'EUR'
  companyName: string | null
  companyWebsite: string | null
  companyAbbreviation: string | null
}

export interface ISiteSettingsRepository {
  /** Returns all stored settings, applying sensible defaults for missing keys. */
  getAll(): Promise<SiteSettings>
  /** Upserts the provided keys. Partial update — unspecified keys are untouched. */
  setMany(values: Partial<SiteSettings>): Promise<void>
}
```
> **OPEN Q (A2):** is this exact field set right? In particular: do we need `siteLogo`
> and `dateFormat` in `site_settings` too, or keep `siteLogo` static and `dateFormat`
> from env? Default assumption: keep `siteLogo` static (`/beechLogoDark.svg`),
> `dateFormat` prefers a stored value then falls back to `env.DATE_FORMAT`. Confirm.

### A3. Core: extend user types
In `packages/core/src/auth/user.repository.ts` add `surname: string | null` to both
`UserRecord` and `NewUserInput`. Add `surname?: string` to the `updateProfile` fields
param.

### A4. D1 impl: `D1SiteSettingsRepository`
New file `apps/api/src/shared/site-settings.repository.d1.ts`. Backed by `site_settings`
(key/value text). `getAll()` reads all rows into a map and returns a `SiteSettings`
object with defaults: `siteTitle:'Beech CMS'`, `defaultLanguage:'it'`,
`timezone:'Europe/Rome'`, `currency:'EUR'`, company fields `null`. `setMany()` upserts
each provided key with `INSERT INTO site_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`.

### A5. D1 impl: extend `D1UserRepository`
- Add `surname` to `UserRow` (`surname: string | null`) and `rowToRecord`.
- Add `surname` to every `SELECT` column list (`findById`, `findByEmail`).
- `create`: `INSERT INTO users (id, email, password_hash, role, name, surname) VALUES (?,?,?,?,?,?)`.
- `updateProfile`: support an optional `surname` column assignment (same dynamic
  builder pattern already used for `name`/`email`).

### A6. Demo data: compiled-in SQL + repository method (D3)
1. Convert `apps/api/migrations/0028_v040_seed_data.sql` into a TS module, e.g.
   `apps/api/src/shared/demo-data.sql.ts` exporting `export const DEMO_DATA_SQL = \`…\``
   with the full SQL content. (It is a series of `INSERT OR IGNORE` statements against
   `content_*` tables.)
2. Add a method to load it. Recommended: extend the new
   `ISiteSettingsRepository`? **No** — keep concerns separate. Create a tiny
   `IDemoDataRepository { loadDemoData(): Promise<void> }` in core, with
   `D1DemoDataRepository` in `apps/api/src/shared/demo-data.repository.d1.ts` that runs
   the SQL. Wire it like any other repo (§3.8). Implementation note: D1 `prepare().run()`
   executes one statement; to run a multi-statement script use
   `await db.exec(DEMO_DATA_SQL)` (D1 supports `exec` for batched statements separated
   by newlines) **or** split on `;\n` and run sequentially. Verify which works against
   the local D1 and document it.
   > **OPEN Q (A6):** acceptable to add a `IDemoDataRepository`, or do you want
   > `loadDemoData()` as a method on `ISiteSettingsRepository` instead? Default
   > assumption: a separate `IDemoDataRepository`.

### A7. `GET /auth/setup` — return environment + service flags (D4)
```ts
setupApp.get('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()
  const isDeveloper = context.env.ENV === 'development'
  const mail = context.env.EMAIL_PROVIDER === 'smtp'
    || !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY)
  const qstash = !!context.env.QSTASH_TOKEN
  return context.json({
    needsSetup: userCount === 0,
    environment: { isDeveloper, services: { mail, qstash } },
  })
})
```

### A8. `POST /auth/setup` — accept & persist the new payload
Extend validation and persistence. **Request body** (see §7 for the full contract):
```
{ name, surname, email, password,
  settings: { language, timezone, currency },
  track: 'developer' | 'normal',
  company?: { name, website, abbreviation? },   // normal track
  loadDemoData?: boolean                         // developer track
}
```
Steps:
1. Keep the `userCount > 0 → 403`, JSON-parse `→ 400`, email `→ 422`, password 8..128
   `→ 422` guards.
2. Validate `settings.language ∈ {'it','en'}`; `timezone`/`currency` non-empty strings.
   On the normal track, require `company.name` (non-empty) and a valid `company.website`
   URL. Return `422` via `publicProblem` on failure.
3. Create the user with `surname` (and `name`), `role:'admin'`, `avatar_url` null.
4. `siteSettingsRepository.setMany({ defaultLanguage: settings.language, timezone,
   currency, ...(normal track ? { companyName, companyWebsite, companyAbbreviation,
   siteTitle: companyName } : {}) })`. (On dev track, store language/timezone/currency
   only.)
5. If `track === 'developer' && loadDemoData === true`, call
   `demoDataRepository.loadDemoData()`.
6. Return `201 { success: true }`.
> **OPEN Q (A8):** should the *normal* track set `siteTitle = company.name`
> automatically (assumed yes above), or keep siteTitle separate from company name?

### A9. `GET /api/settings` — read from DB
Replace the hardcoded object:
```ts
settingsApp.get('/', async (context) => {
  const s = await context.get('siteSettingsRepository').getAll()
  return context.json({
    siteTitle: s.siteTitle,
    siteLogo: '/beechLogoDark.svg',
    defaultLanguage: s.defaultLanguage,
    timezone: s.timezone,
    currency: s.currency,
    company: { name: s.companyName, website: s.companyWebsite, abbreviation: s.companyAbbreviation },
    dateFormat: context.env.DATE_FORMAT || 'DD-MM-YYYY',
    features: { drafts: true, media: true, search: true, activityLog: true,
      email: context.env.EMAIL_PROVIDER === 'smtp' || !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY) },
  })
})
```
> **OPEN Q (A9):** the dashboard already consumes `GET /api/settings` via
> `apps/dashboard/src/features/settings/{api/settings.api.ts,hooks/use-settings.ts}`.
> Adding fields is safe, but confirm you also want the dashboard to *render*
> timezone/currency/company anywhere now, or is persistence-only enough for this sprint?

### A10. `PUT /api/settings/profile` — accept surname
Parse `surname` (trim, max 100), include in `fieldsToUpdate`, pass to
`updateProfile`. Also include `surname` in the `GET /me` response object.

---

## 5. PHASE B — FRONTEND: centered modal & multi-step wizard

Rewrite `apps/dashboard/src/pages/setup/SetupPage.tsx`.

### B1. Layout & state
- Centered modal: outer `flex min-h-svh items-center justify-center`, inner card
  `w-full max-w-md` (or wider for the wizard).
- Step state: `const [step, setStep] = useState<1|2|3>(1)`.
- On mount, `GET /auth/setup` (axios) → store `environment.isDeveloper` and
  `environment.services`. Choose the initial `track`: `'developer'` when `isDeveloper`,
  else `'normal'`.

### B2. Step indicators with light→dark gradient
- Three numbered circles above the form. The active/completed steps progress from a
  light gradient (step 1) toward a dark/premium gradient (step 3) using Tailwind
  gradient utilities (`bg-gradient-to-br from-… to-…`). Keep it tasteful; no inline
  hex unless necessary.

### B3. Step 1 — site defaults + track toggle
- Three `Select` dropdowns (Language, Timezone, Currency) using the Shadcn `Select`
  family (see §6). Language options `it`/`en`. Provide a short curated timezone list
  (at least `Europe/Rome`, `UTC`, a few common ones) and currency list (`EUR`, `USD`,
  `GBP`, …).
- A **developer-setup alert box** that appears only when `environment.isDeveloper`.
  It contains a hyperlink/toggle that switches `track` between `'developer'` and
  `'normal'` ("Switch to normal setup" / "Switch to developer setup").
- "Next" → step 2.

---

## 6. PHASE C — strength, service check, loading

### C1. Step 2 — credentials + strength bar
- Fields: Name, **Surname (Cognome)**, Email, Password (+ Confirm). Use `Input`,
  `Label`.
- **Password strength bar** using the Shadcn `Progress` component
  (`import { Progress } from '@/components/ui/progress'`). Compute a 0–100 score from
  length + character classes (lower/upper/digit/symbol). Color the bar by tier
  (e.g. red <40, amber <70, green ≥70) via a className on the indicator or a wrapper.
  Animate width transitions.
- Client validation mirrors backend: password 8..128, `password === confirm`, valid
  email. "Back"/"Next".

### C2. Step 3 — track-dependent
- **Developer track:** a checklist rendering the `environment.services` flags
  (`mail`, `qstash`) as read-only status rows (✓/✗). A `Checkbox`
  (`@/components/ui/checkbox`) labeled "Load demo database content" → sets
  `loadDemoData`.
- **Normal track:** `Input`s for Company Website (url), Company Name, optional Company
  Abbreviation.
- "Back" / "Finish".

### C3. Submit + loading state
- On Finish: build the §7 payload, `axios.post('/auth/setup', payload)`.
- While in-flight: **empty the modal body** and render a `Progress` bar (indeterminate
  or animated) with a caption like "Creating your account…" / "Seeding demo data…".
- On success → `navigate('/login', { replace: true })`.
- On error → surface `err.response.data.title` (RFC 7807 shape) like the current page.

---

## 7. DATA CONTRACTS

### `GET /auth/setup` → 200
```json
{
  "needsSetup": true,
  "environment": { "isDeveloper": true, "services": { "mail": true, "qstash": false } }
}
```

### `POST /auth/setup` → 201 `{ "success": true }`
Request body:
```json
{
  "name": "Flavio",
  "surname": "De Musso",
  "email": "admin@example.com",
  "password": "…(8..128)…",
  "settings": { "language": "it", "timezone": "Europe/Rome", "currency": "EUR" },
  "track": "developer",
  "loadDemoData": true,

  "company": { "name": "Acme", "website": "https://acme.com", "abbreviation": "ACM" }
}
```
- `company` present only on `track: "normal"`; `loadDemoData` only on
  `track: "developer"`.
- Error shape (RFC 7807): `{ type, title, status, detail }` with status 400/403/422.

### `GET /api/settings` → 200 (after A9)
```json
{
  "siteTitle": "Acme",
  "siteLogo": "/beechLogoDark.svg",
  "defaultLanguage": "it",
  "timezone": "Europe/Rome",
  "currency": "EUR",
  "company": { "name": "Acme", "website": "https://acme.com", "abbreviation": "ACM" },
  "dateFormat": "DD-MM-YYYY",
  "features": { "drafts": true, "media": true, "search": true, "activityLog": true, "email": true }
}
```

---

## 8. UI COMPONENT REFERENCE (all already exist in `apps/dashboard/src/components/ui/`)

- `button.tsx` → `Button`
- `input.tsx` → `Input`
- `label.tsx` → `Label`
- `card.tsx` → `Card, CardContent, CardDescription, CardHeader, CardTitle`
- `checkbox.tsx` → `Checkbox`
- `progress.tsx` → `Progress`
- `select.tsx` → `Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger,
  SelectValue`

Typical `Select` usage:
```tsx
<Select value={language} onValueChange={setLanguage}>
  <SelectTrigger><SelectValue placeholder={t('setup.languagePlaceholder')} /></SelectTrigger>
  <SelectContent>
    <SelectItem value="it">Italiano</SelectItem>
    <SelectItem value="en">English</SelectItem>
  </SelectContent>
</Select>
```

---

## 9. i18n

- Files: `apps/dashboard/src/locales/it.json` and `en.json`, single namespace
  `translation`, keys grouped by feature. Existing top-level groups include `common`,
  `settings`, `login`, `forgotPassword`, `resetPassword`, … There is **no** `setup`
  group yet and **no** `auth` group (auth screens use `login`/`forgotPassword`/etc.).
- **Add a new `setup` group** with every visible string from the wizard (step titles,
  field labels, placeholders, track-toggle text, service-check labels, demo checkbox
  label, button labels, loading captions, error fallbacks). Add identical keys to both
  files. Use `const { t } = useTranslation()` and `t('setup.<key>')`.

---

## 10. FILES TO TOUCH (checklist)

Backend / core:
- `packages/core/src/auth/user.repository.ts` — add `surname` to types (A3)
- `packages/core/src/site-settings.repository.ts` — new interface (A2)
- `packages/core/src/index.ts` (barrel) — export new interfaces
- `packages/core/src/<demo-data interface>` — `IDemoDataRepository` (A6)
- `apps/api/migrations/0000_v040_base.sql` (+ maybe `0031_site_settings.sql`) — A1
- `apps/api/src/shared/d1-user.repository.ts` — surname (A5)
- `apps/api/src/shared/site-settings.repository.d1.ts` — new (A4)
- `apps/api/src/shared/demo-data.sql.ts` — compiled SQL (A6)
- `apps/api/src/shared/demo-data.repository.d1.ts` — new (A6)
- `apps/api/src/middleware/repository.middleware.ts` — wire new repos (3.8)
- `apps/api/src/types.ts` — add `Variables.siteSettingsRepository`,
  `demoDataRepository` (3.9)
- `apps/api/src/features/setup/index.ts` — A7, A8
- `apps/api/src/features/settings/settings.handler.ts` — A9, A10

Frontend:
- `apps/dashboard/src/pages/setup/SetupPage.tsx` — full rewrite (B/C)
- `apps/dashboard/src/locales/it.json`, `en.json` — `setup.*` keys (§9)
- (verify, A9) `apps/dashboard/src/features/settings/api/settings.api.ts` +
  `hooks/use-settings.ts` if the settings response type is typed there.

---

## 11. VALIDATION / ACCEPTANCE

1. **Types:** `npx tsc --noEmit` passes in `packages/core`, `apps/api`, and
   `apps/dashboard`. (Core must build first — `npm run build` at root respects order.)
2. **DB reset:** in `apps/api/`, `npm run db:reset:local` succeeds with the new schema
   (`surname`, `site_settings`).
3. **Run:** `npm run dev` at root (API :8789, Dashboard :5173). Visit the setup screen.
4. **Developer flow:** with `ENV=development`, the dev alert appears; toggle works;
   complete with "Load demo data" checked → after submit, query the DB and confirm
   sample rows exist in `content_*` tables; service checklist reflects `mail`/`qstash`.
5. **Normal flow:** toggle to normal track, enter company name/website → after submit,
   `GET /api/settings` returns the company metadata and `siteTitle` reflects it.
6. **Persistence:** chosen language/timezone/currency are stored in `site_settings` and
   returned by `GET /api/settings` — not read from env.
7. **Loading state:** the modal empties and shows the progress bar during submit.
8. **i18n:** every wizard string resolves in both `it` and `en`; no hardcoded strings.

---

## 12. OPEN QUESTIONS FOR THE IMPLEMENTER TO CONFIRM

Resolve these with the product owner before/while implementing; defaults are noted so
you are never blocked:

- **(A1)** New migration for `site_settings` vs editing `0000`? (default: new migration
  for the table, inline `surname` in `0000`.)
- **(A2)** Exact `SiteSettings` field set — include `siteLogo`/`dateFormat` in the DB?
  (default: no; logo static, dateFormat env-fallback.)
- **(A6)** Separate `IDemoDataRepository` vs a method on another repo? (default:
  separate.) Also confirm `db.exec` vs statement-splitting works on local D1.
- **(A8)** Normal track sets `siteTitle = company.name` automatically? (default: yes.)
- **(A9)** Render timezone/currency/company in the dashboard now, or persistence-only
  this sprint? (default: persistence-only; rendering is a later sprint.)
- **Timezone/currency option lists:** curated short lists, or a full IANA/ISO-4217
  list? (default: curated short list for the wizard.)
