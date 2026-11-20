<img width="1516" height="527" alt="Frame 9 (1)" src="https://github.com/user-attachments/assets/5b3783e7-6152-4ba2-95cd-c7e26e149f7f" />


# Contributing to BeechCMS
Thank you for your interest in contributing to BeechCMS.
This document outlines every rule and convention that **must be followed** before opening a pull request. Please read it in full — it is the single source of truth for contributors.

---

## Table of Contents

0. [Development setup](#0-development-setup)
1. [Branching strategy](#1-branching-strategy)
2. [Commit conventions](#2-commit-conventions)
3. [Code quality standards](#3-code-quality-standards)
4. [Architecture: Vertical Slice Architecture (VSA)](#4-architecture-vertical-slice-architecture-vsa)
5. [Documentation and System Map](#5-documentation-and-system-map)
6. [Languages and translations](#6-languages-and-translations)
7. [AI-assisted development](#7-ai-assisted-development)
8. [Submitting a pull request](#8-submitting-a-pull-request)

---

## 0. Development setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Required |
| pnpm | 11+ | Required |
| **Docker Desktop** or **Docker Engine** | any recent | **Required** — media uploads use presigned URLs and need a local S3-compatible endpoint (MinIO) |

Docker is a hard prerequisite. Without it, the API and dashboard start normally but any file upload will fail at runtime.

### First-time setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Configure local environment variables
cp apps/api/.dev.vars.example apps/api/.dev.vars
# The example file is pre-filled with MinIO credentials — no edits needed for local dev.

# 3. Start the full development environment
ppnpm run dev:full
```

`ppnpm run dev:full` starts MinIO (local S3-compatible storage), the Cloudflare Workers API, and the React dashboard in parallel. It is the **canonical development command**.

### Storage commands

| Command | Description |
|---------|-------------|
| `ppnpm run dev:full` | **Canonical**: starts MinIO + API + Dashboard |
| `ppnpm run dev:storage` | Starts only MinIO (useful when restarting API/Dashboard independently) |
| `ppnpm run dev:storage:stop` | Stops MinIO containers |
| `ppnpm run dev:storage:reset` | Destroys MinIO containers and volumes (full reset) |
| `ppnpm run dev` | API + Dashboard only — requires MinIO already running |

> **MinIO console**: [http://localhost:9001](http://localhost:9001) — username `beechdev`, password `beechdevsecret`.

For a full explanation of the storage setup and environment variables, see [`docs/development.md`](../docs/development.md).

---

## 1. Branching strategy

BeechCMS uses a **two-tier branching model**.

| Branch | Purpose | Who can push |
|--------|---------|-------------|
| `devs` | Active development — all contributions land here | Any contributor |
| `master` | Stable, production-ready state — always corresponds to a published pnpm release | Project owner only |

### Rules

- **All pull requests must target `devs`**, never `master`.
- `master` is bumped exclusively by the project owner and always coincides with an pnpm package release.
- Never force-push to either branch.
- Create a short-lived feature or fix branch off `devs`, for example:

```
feature/automation-scheduler
fix/media-upload-r2-key
docs/api-reference-update
```

---

## 2. Commit conventions

All commits must follow the **Conventional Commits** standard. This is enforced during review.

```
<type>(<scope>): <short description in imperative mood>
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature visible to users or consumers of the package |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `chore` | Build scripts, CI, dependency updates, tooling — no production code change |
| `refactor` | Code restructuring with no behaviour change |
| `test` | Adding or updating tests |
| `perf` | Performance improvements |
| `style` | Formatting, whitespace — no logic change |

### Examples

```
feat(automations): add cron-based scheduler for recurring actions
fix(botanical-engine): correct boolean serialisation for D1 columns
docs(api-reference): document the /toggle endpoint for automations
chore(deps): bump wrangler to v3.57
refactor(content): extract query-builder into a dedicated utility
```

### Rules

- The description must be written in the **imperative mood** ("add", "fix", "update" — not "added" or "fixes").
- Keep the subject line under **72 characters**.
- If the commit requires context, add a body separated by a blank line.
- **Breaking changes** must be noted with `BREAKING CHANGE:` in the commit footer.

---

## 3. Code quality standards

BeechCMS is a typed, schema-driven platform. Code quality is non-negotiable.

### Naming and readability

- **No unexplained acronyms.** Every identifier must be self-descriptive. If a short name is necessary, add a comment explaining what it represents.
- **No unexplained gaps in logic.** Any non-obvious branching, early return, or workaround must have a comment that explains *why*, not just *what*.
- **No dangling ternaries.** Complex conditional logic must use explicit `if`/`else` blocks or named helper functions. Ternaries are acceptable only for simple, self-evident assignments.

```typescript
// ✅ Acceptable
const label = isPublished ? 'Published' : 'Draft';

// ❌ Not acceptable — logic is too dense to read at a glance
const result = a ? b ? c : d : e ? f : g;
```

### Issues and partial work

- **No half-resolved issues.** Do not close an issue with code that addresses only part of the problem without explicitly documenting the remainder in a follow-up issue or a `TODO` comment that references the issue number.
- `TODO` comments must include the reason and a linked issue:

```typescript
// TODO(#142): async resolution of inline seed lookups is deferred to the next sprint.
// The resolver currently handles only synchronous context variables.
```

### TypeScript

- All new code must be fully typed — no `any` unless there is a documented reason.
- Run `npx tsc --noEmit` in both `apps/api` and `apps/dashboard` before opening a PR. Both must be error-free.

### Testing

- New features and bug fixes must be accompanied by tests co-located with the file they test (e.g., `product.utils.test.ts` lives next to `product.utils.ts`).
- Run `ppnpm run test` at the repo root before opening a PR. All suites must be green.

### Code duplication

- **Do not duplicate logic across slices.** If the same utility is needed in more than one feature, promote it to the appropriate `shared/` layer.
- The rule of thumb: write it once in the feature, promote it to `shared/` the second time it is needed.
- Duplication is always preferable to creating a direct cross-slice dependency, but both are a signal to refactor.

---

## 4. Architecture: Vertical Slice Architecture (VSA)

BeechCMS is built on **Vertical Slice Architecture**. Every contribution must respect its rules without exception.

A full reference is available in [`docs/vertical-slice.md`](../docs/vertical-slice.md).

### Core principles

- Code is organised **by domain feature**, not by technical layer.
- Each slice is **fully self-contained**: its own components, hooks, handlers, validators, types, and constants.
- **Slices never import directly from each other.** A slice may only import from `shared/` or from the routing/factory layer.

### Dependency rules

```
Routing / App Factory  →  Feature slices, Shared
Feature slices         →  Shared only
Shared                 →  Nothing internal
Feature  →  Feature    ✗  FORBIDDEN
```

### Public API contract

Every feature slice exposes a public API through its `index.ts` barrel file. Only symbols exported from `index.ts` may be imported by other parts of the application. Internal implementation files (utilities, constants, repository, validators) are private by contract.

```typescript
// features/content/index.ts — only public symbols are exported
export { ContentList } from './components/ContentList';
export { useContent } from './hooks/useContent';
export type { ContentEntry } from './types/content.types';
// Do NOT export internal utils, validators, or repository
```

### Interfaces

Where a slice depends on infrastructure (database, storage, external service), the dependency must be expressed as an **interface defined in `packages/core`**, injected via middleware, and never instantiated directly inside the slice.

```typescript
// ✅ Correct — handler consumes the injected interface
const repository = context.get('repository') as ContentRepository;

// ❌ Incorrect — handler creates its own concrete instance
const repository = new D1ContentRepository(db);
```

### Where new features live

| App | Path |
|-----|------|
| API (Hono / Cloudflare Workers) | `apps/api/src/features/<feature-name>/` |
| Dashboard (React / Vite) | `apps/dashboard/src/features/<feature-name>/` |
| Shared engine and types | `packages/core/src/` |

---

## 5. Documentation and System Map

### Rule: code and documentation are a single unit of work

A PR that introduces a new feature, changes a public API, or modifies a shared interface **is not complete** until the relevant documentation is updated.

### What to update

| Change type | Document to update |
|-------------|--------------------|
| New API endpoint or changed contract | `docs/api-reference.md` |
| New feature slice or architectural change | `docs/vertical-slice.md` and, if the folder structure changes, `docs/architecture.md` |
| New automation action or schema change | `docs/automations.md` |
| Frontend field renderer or dashboard feature | `docs/frontend-guide.md` |
| Email module change | `docs/email-module.md` |
| New or removed language, interface or email | `docs/features/localization.md`, `docs/features/email-module.md`, and the i18n lines of `_config/SYSTEM_MAP.md` |
| Any cross-cutting change that affects the overall picture | **`docs/system-map.md`** |

### System Map (`docs/system-map.md`)

The system map is the high-level entry point for new contributors and AI tools. It must reflect the **current state** of the repository at all times.

- If you add or rename a feature slice, update the folder architecture section.
- If you add a new integration or change a major dependency, update the tech-stack section.
- If a non-obvious convention changes, update the relevant section in the system map.

Do not leave the system map out of date. A stale system map is worse than no map.

---

## 6. Languages and translations

The dashboard speaks five languages. English is the source; every other file is a translation of it.

| Code | Language | Address form |
|------|----------|--------------|
| `en` | English (source and fallback) | — |
| `it` | Italiano | tu |
| `es` | Español | tú |
| `de` | Deutsch | Sie |
| `fr` | Français | vous |

Dictionaries live in `apps/dashboard/src/locales/<code>.json`. Transactional emails are a separate system and currently exist in `en` and `it` only (see [Email languages](#email-languages)).

### Rules for UI strings

- **Add the English string first**, then the same key in every other locale in the same commit. The locale tests fail on a missing or extra key, an empty string, or a `{{variable}}` or `<tag>` that differs from the English one.
- **Name keys `<domain>.<surface>.<element>.<role>`**, in `camelCase`, at most 5 levels deep. The role says what the string is (`label`, `title`, `placeholder`, `hint`, `description`, `tooltip`, `ariaLabel`, `badge`, `column`, `button`, `success`, `error`, `toast`, `sentence`), so a translator knows the space it has without a separate context file. A segment that mirrors a backend enum value (`discard_draft`, `isempty`) keeps the enum's spelling.
- **Generic verbs live in `common.action.*`**: only `save`, `cancel`, `close`, `back`, `confirm` and `delete`. Domain actions ("Add field", "Create role") stay in their domain, because other languages change gender and phrasing with the object.
- **Never build a sentence from fragments.** Write one string with `{{variables}}`, and use `<Trans>` with named tags (`<user>`, `<target>`, `<kbd>`, `<code>`) when parts of it need markup. Word order is the translator's decision.
- **Plurals use native i18next suffixes**: `_one` and `_other` (plus `_many` in `es` and `fr`). Every plural key needs `_other`. Do not introduce ICU message syntax.
- **Variables are `{{double braces}}`.** To show a literal `{{token}}` (for example automation template syntax), pass it as a variable value instead of writing it in the string. The tokens inside `automations.actions.hintFixed`, `hintCollection` and `filterTemplateHint` must stay identical in every language.
- **Every key used in code must exist in `en.json`**, and a call site carries no hardcoded fallback text. `locale-keys.test.ts` fails otherwise. Prefer static keys; a key built from a runtime value (`` t(`area.${value}`) ``) is only for values that come from a fixed enum, and its subtree must not be renamed.
- **Keep `.badge`, `.tab`, `.column` and `.button` strings short.** German and French run 30–40% longer than English.

### Glossary

`apps/dashboard/src/locales/glossary.json` is the contract for terms that must not drift between languages:

- `hard_dnt` terms (`Seed`, `Slug`, `Webhook`, `Beech`, `BeechCMS`, `Studio`, `JSON`, …) stay verbatim in every language. The match is case-sensitive on word boundaries, except `Cron`. The locale tests enforce it.
- `soft_dnt` terms are loanwords that some languages translate (`Dashboard` is "Panel" in Spanish and "Tableau de bord" in French). Follow the `translation_note` of the term.
- Add a term as one atomic entry, never a slash-separated list.

### Adding a dashboard language

1. Create `apps/dashboard/src/locales/<code>.json` from `en.json`, following the glossary.
2. Register it in `apps/dashboard/src/lib/i18n.ts` (`resources` and `supportedLngs`).
3. Add its native name to `DASHBOARD_LANGUAGES` in `features/settings/hooks/use-dashboard-language.ts`.
4. Add its date-fns locale to `apps/dashboard/src/lib/date-locale.ts`.
5. Add it to `apps/dashboard/src/test/setup.ts` and to the locale list in `locales.test.ts`, so the full parity suite runs against it.
6. Decide on emails (see below) and update the documentation listed in section 5.

### Content languages

The languages of your *content* (entry fields marked `localized`) are a project setting and have nothing to do with the dashboard's interface language. See [`docs/features/localization.md`](../docs/features/localization.md).

### Email languages

`resolveEmailLocale()` in `apps/api/src/shared/email/email.types.ts` reduces a regional tag (`it-IT`, `de_AT`) to its base language and falls back to `en` for a language without a template. Adding a dashboard language does **not** add emails in it. To add one, follow *Adding Languages* in [`docs/features/email-module.md`](../docs/features/email-module.md), including the glossary rules.

---

## 7. AI-assisted development

AI agents and coding assistants are welcome and encouraged in the BeechCMS workflow, subject to the following rules.

### Use the System Map as context

Before asking an AI agent to write or modify code, provide the contents of `docs/system-map.md` as context. This ensures the agent understands the monorepo topology, the VSA conventions, and the dependency rules before generating any output.

> The system map is specifically designed to be token-efficient. Reference only the sections relevant to your task to keep context within budget.

### Recommended graph-based workflow

For tasks that involve navigating or modifying the codebase structure, use the [**Graphify**](https://github.com/safishamsi/graphify) workflow. Graphify builds a graph representation of the repository that AI agents can query to understand module relationships, identify coupling, and locate the correct slice for a given change — reducing the risk of the agent generating cross-slice imports or duplicating existing logic.

### AI-generated code must meet the same standards

AI-generated code is subject to all the same rules as human-authored code: VSA compliance, full typing, no unexplained gaps, updated documentation. Review AI output carefully before including it in a commit.

---

## 8. Submitting a pull request

### Contributor License Agreement (CLA)

By submitting a pull request to BeechCMS, you agree to the following terms:
1. **License Grant:** You grant BeechCMS (and Flavio De Musso) a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contributions and such derivative works.
2. **Originality:** You confirm that you are the original author of the contribution and have the legal right to grant these rights.
3. **Licensing:** Your contribution is submitted under the same licensing terms that govern the repository (MIT for \`packages/core\`, BUSL-1.1 for \`apps/*\`).

**Note:** This serves as a lightweight Contributor License Agreement. By opening a PR, you explicitly agree to these terms. No separate CLA Assistant signing is required.

### Checklist before opening a PR

- [ ] The branch targets `devs`, not `master`.
- [ ] All commits follow the Conventional Commits format.
- [ ] `pnpm run build` in `packages/core` exits with code 0.
- [ ] `pnpm run build` in `apps/api` exits with code 0 (`tsc --noEmit`).
- [ ] `pnpm run build` in `apps/dashboard` exits with code 0 (`tsc -b`).
- [ ] `ppnpm run test` at the repo root — all suites are green.
- [ ] If the change touches media upload, `ppnpm run dev:full` was used and an end-to-end upload (presign → PUT → confirm) was verified manually.
- [ ] No cross-slice imports — each feature only imports from `shared/` or the routing layer.
- [ ] No unexplained acronyms, dangling ternaries, or half-resolved logic.
- [ ] No use of `any` without a documented reason in a comment.
- [ ] New or changed UI strings exist in every dashboard locale and the locale tests (`apps/dashboard/src/locales`) pass.
- [ ] New or changed public-facing behaviour is documented in the relevant `docs/` file.
- [ ] `docs/system-map.md` is updated if the folder structure, tech stack, or major conventions changed.

### PR description

Use this template when opening a pull request:

```markdown
## Summary
<!-- What does this PR do? Why is it needed? -->

## Changes
<!-- List the files or slices modified -->

## Testing
<!-- How was this tested? Which test suites cover it? -->

## Documentation
<!-- Which docs files were updated, or why no update was needed? -->

## Breaking changes
<!-- List any breaking changes, or write "None" -->
```

---

## Questions

If anything in this guide is unclear, open a [Discussion](https://github.com/fdemusso/BeechCMS/discussions) before starting work. It is always better to align on the approach first than to rewrite a PR after review.
