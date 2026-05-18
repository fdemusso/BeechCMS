# BeechCMS — Release Guide

This document covers the versioning scheme and how to cut a release using the automated release script.

---

## Version Scheme

BeechCMS uses semantic versioning with a preview channel:

| Format | Channel | npm tag | Who installs it |
|---|---|---|---|
| `0.4.0-preview.N` | Preview | `next` | Early adopters, CI testing |
| `0.4.0` | Stable | `latest` | Everyone by default |

**Preview builds** iterate `N` for every incremental publish on the same base version. When a new semver bump is introduced, `N` resets to `1`.

---

## Prerequisites

- `npm login` — authenticated to npm as the `@beechcms` org owner
- Clean git working tree (no uncommitted changes)
- On the correct branch (typically `v0.x.0` feature branch or `dashboard` for stable)

---

## The Release Script

Located at `scripts/release.mjs`. Run via npm scripts or directly with Node.

### Syntax

```bash
node scripts/release.mjs [--bump patch|minor|major] [--preview] [--dry-run]
```

Or via npm shortcuts:

```bash
npm run release           # stable release (strip preview suffix)
npm run release:preview   # preview release (same base, increment N)
```

### Options

| Flag | Description |
|---|---|
| `patch`, `minor`, `major` | Positional argument to bump version (e.g. `npm run release patch`) |
| `--bump <type>` | Alternative syntax for bumping (requires `--` if using `npm run`) |
| `--preview` | Publish to `next` tag with `-preview.N` suffix |
| `--dry-run` | Print every step without writing files or publishing |

> **Note on `npm run` syntax:** 
> When using `npm run release`, npm might consume some flags. To be safe, either use positional arguments or use the `--` separator:
> ```bash
> npm run release patch --dry-run      # ✅ Works (positional)
> npm run release -- --bump patch      # ✅ Works (with --)
> npm run release --preview            # ✅ Works
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

The script is designed to be atomic on the filesystem: before touching any file it snapshots all four `package.json` files. If **build** or **publish** fails, the snapshot is restored and the script exits with a non-zero code — leaving the working tree exactly as it was before the run.

The one exception is npm itself: if the second or third package fails to publish, the packages already pushed to the registry in that run are **not** rolled back (npm does not support unpublish on scoped packages after a short window). In that case, manually bump and re-publish the missing packages.

If the **git step** fails after a successful publish, file changes are intentionally kept (they reflect what is on npm) and the script prints the exact commands to recover:
```
git add -A && git commit -m "chore: release <version>" && git tag v<version>
```

---

## What the Script Does

The script runs four steps in sequence:

### 1. Bump versions

Updates `"version"` in all four package manifests to the computed next version, and also updates any internal `@beechcms/*` cross-references in `dependencies`:

- `packages/core/package.json` — `@beechcms/core`
- `packages/cli/package.json` — `@beechcms/cli`
- `apps/api/package.json` — `@beechcms/api`
- `package.json` (root) — `@beechcms/cms`

### 2. Build

Runs `npm run build` at the monorepo root, which delegates to Turborepo. Build order is enforced by `turbo.json` (`@beechcms/core` before consumers).

### 2b. Copy dashboard assets

Copies the compiled React admin dashboard from `apps/dashboard/dist/admin` into `apps/api/assets/dashboard`. This ensures the API package includes the latest UI when published.

### 3. Publish

Publishes each package to npm in dependency order with `--access public --tag <next|latest>`. Packages are published in this order:

1. `@beechcms/core`
2. `@beechcms/cli`
3. `@beechcms/api`
4. `@beechcms/cms` (root scaffolder)

### 4. Git tag

Stages the four modified `package.json` files, creates a commit (`chore: release <version>`), and tags it `v<version>`.

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
| `@beechcms/cli` | `npx beech` CLI (seed:load, etc.) | Project `devDependencies` |
| `@beechcms/api` | Worker factory, migrations, dashboard bundle | Project `dependencies` |
| `@beechcms/cms` | `npx @beechcms/cms` scaffolder | End users (one-time) |
