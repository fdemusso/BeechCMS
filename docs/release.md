# BeechCMS — Release Guide

This document covers the versioning scheme and how to cut a release using the automated release script.

---

## Version Scheme

BeechCMS uses semantic versioning with a preview channel:

| Format | Channel | pnpm tag | Who installs it |
|---|---|---|---|
| `0.4.0-preview.N` | Preview | `next` | Early adopters, CI testing |
| `0.4.0` | Stable | `latest` | Everyone by default |

**Preview builds** iterate `N` for every incremental publish on the same base version. When a new semver bump is introduced, `N` resets to `1`.

---

## Prerequisites

- `pnpm login` — authenticated to pnpm as the `@beechcms` org owner
- Clean git working tree (no uncommitted changes)
- On the correct branch (typically `v0.x.0` feature branch or `dashboard` for stable)

---

## The Release Script

Located at `scripts/release.mjs`. Run via pnpm scripts or directly with Node.

### Syntax

```bash
node scripts/release.mjs [--bump patch|minor|major] [--preview] [--dry-run]
```

Or via pnpm shortcuts:

```bash
pnpm run release           # stable release (strip preview suffix)
pnpm run release:preview   # preview release (same base, increment N)
```

### Options

| Flag | Description |
|---|---|
| `patch`, `minor`, `major` | Positional argument to bump version (e.g. `ppnpm run release patch`) |
| `--bump <type>` | Alternative syntax for bumping (requires `--` if using `pnpm run`) |
| `--preview` | Publish to `next` tag with `-preview.N` suffix |
| `--dry-run` | Print every step without writing files or publishing |

> **Note on `pnpm run` syntax:** 
> When using `pnpm run release`, pnpm might consume some flags. To be safe, either use positional arguments or use the `--` separator:
> ```bash
> pnpm run release patch --dry-run      # ✅ Works (positional)
> pnpm run release -- --bump patch      # ✅ Works (with --)
> pnpm run release --preview            # ✅ Works
> ```

### Examples

```bash
# Bump preview number (same semver base)
node scripts/release.mjs --preview
# 0.4.0-preview.5 → 0.4.0-preview.6

# Start a new minor preview series
node scripts/release.mjs --bump minor --preview
# 0.4.0-preview.5 → 0.5.0-preview.1

# Promote preview to stable (no semver bump)
node scripts/release.mjs
# 0.4.0-preview.5 → 0.4.0

# Stable patch release from a stable base
node scripts/release.mjs --bump patch
# 0.4.0 → 0.4.1

# Simulate without touching anything
node scripts/release.mjs --bump minor --dry-run
```

---

## Atomicity and Rollback

The script is designed to be atomic on the filesystem: before touching any file it snapshots all six `package.json` files and `LICENSE`. If **type-check**, **build**, or **publish** fails, the snapshot is restored and the script exits with a non-zero code — leaving the working tree exactly as it was before the run.

The one exception is pnpm itself: if a later package fails to publish, the packages already pushed to the registry in that run are **not** rolled back (pnpm does not support unpublish on scoped packages after a short window). In that case, manually bump and re-publish the missing packages.

If the **git step** fails after a successful publish, file changes are intentionally kept (they reflect what is on pnpm) and the script prints the exact commands to recover:
```
git add -A && git commit -m "chore: release <version>" && git tag v<version>
```

---

## What the Script Does

The script runs the following steps in sequence:

### 1. Bump versions

Updates `"version"` in the package manifests to the computed next version, and also updates any internal `@beechcms/*` (or `@beech/*`) cross-references in `dependencies`, `devDependencies`, and `peerDependencies`:

- `packages/core/package.json` — `@beechcms/core`
- `packages/widget-sdk/package.json` — `@beechcms/widget-sdk`
- `packages/cli/package.json` — `@beechcms/cli`
- `apps/api/package.json` — `@beechcms/api`
- `apps/dashboard/package.json` — `@beechcms/dashboard` (version bumped, but **not published** — built into the API assets, see step 2b)
- `package.json` (root) — `@beechcms/cms`

### 1b. Update LICENSE change date

Bumps the `Change Date:` line in `LICENSE` to four years from the release date.

### 2. Type-check

Runs `pnpm run type-check` at the monorepo root. Failure triggers rollback before anything is built or published.

### 2 (cont.). Build

Runs `pnpm run build` at the monorepo root, which delegates to Turborepo. Build order is enforced by `turbo.json` (`@beechcms/core` before consumers).

### 2b. Copy dashboard assets

Copies the compiled React admin dashboard from `apps/dashboard/dist/admin` into `apps/api/assets/dashboard`. This ensures the API package includes the latest UI when published.

### 3. Publish

Publishes each package to pnpm in dependency order with `--access public --no-git-checks --tag <next|latest>`. Packages are published in this order:

1. `@beechcms/core`
2. `@beechcms/widget-sdk`
3. `@beechcms/cli`
4. `@beechcms/api`
5. `@beechcms/cms` (root scaffolder)

### 4. Git tag

Stages all six modified `package.json` files (`core`, `widget-sdk`, `cli`, `api`, `dashboard`, root), the `apps/api/assets/dashboard` bundle, and `LICENSE`, creates a commit (`chore: release <version>`), and tags it `v<version>`.

> **Note:** the script does **not** push to remote. After the script completes, push manually:
> ```bash
> git push && git push --tags
> ```

---

## Typical Release Workflow

### Releasing a preview during active development

```bash
# Iterating on a feature branch
node scripts/release.mjs --preview
# repeat as needed

# Starting a new minor cycle
node scripts/release.mjs --bump minor --preview
```

### Promoting to stable

```bash
# When preview is ready to ship
node scripts/release.mjs        # strips -preview.N, publishes @latest

git push && git push --tags
```

### Hotfix on stable

```bash
# On the stable branch, after applying the fix
node scripts/release.mjs --bump patch

git push && git push --tags
```

---

## Packages Published

| Package | Purpose | Installed by |
|---|---|---|
| `@beechcms/core` | Botanical Engine, types, validation | Internal dependency |
| `@beechcms/widget-sdk` | Custom dashboard widgets SDK | Widget packages `dependencies` |
| `@beechcms/cli` | `npx beech` CLI (seed:load, etc.) | Project `devDependencies` |
| `@beechcms/api` | Worker factory, migrations, dashboard bundle | Project `dependencies` |
| `@beechcms/cms` | `npx @beechcms/cms` scaffolder | End users (one-time) |
