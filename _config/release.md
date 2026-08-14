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
| `patch`, `minor`, `major` | Positional argument to bump version (e.g. `pnpm run release patch`) |
| `--bump <type>` | Alternative syntax for bumping (requires `--` if using `pnpm run`) |
| `--preview` | Publish to `next` tag with `-preview.N` suffix |
| `--dry-run` | Print every step without writing files or publishing |

---

## What the Script Does

The script runs four steps in sequence:

1. **Bump versions**: Updates `"version"` in package manifests to the computed next version.
2. **Build**: Runs `pnpm run build` at the monorepo root via Turborepo.
3. **Copy dashboard assets**: Copies compiled dashboard from `apps/dashboard/dist/admin` into `apps/api/assets/dashboard`.
4. **Publish**: Publishes each package to pnpm with `--access public --tag <next|latest>`.
5. **Git tag**: Stages modified `package.json` files, creates a commit (`chore: release <version>`), and tags `v<version>`.

---

## Packages Published

| Package | Purpose | Installed by |
|---|---|---|
| `@beechcms/core` | Botanical Engine, types, validation | Internal dependency |
| `@beechcms/widget-sdk` | Custom dashboard widgets SDK | Widget packages `dependencies` |
| `@beechcms/cli` | `npx beech` CLI (seed:load, etc.) | Project `devDependencies` |
| `@beechcms/api` | Worker factory, migrations, dashboard bundle | Project `dependencies` |
| `@beechcms/cms` | `npx @beechcms/cms` scaffolder | End users (one-time) |
