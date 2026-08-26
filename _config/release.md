# BeechCMS — Release Guide

This document covers the independent package versioning scheme, intelligent Git Diff change detection, and how to cut releases using the automated release script (`scripts/release.mjs`).

---

## 🎯 Versioning Strategy

BeechCMS uses **independent per-package semantic versioning** with a preview channel. Each package in the monorepo has its own version and release lifecycle based on actual modifications.

| Format | Channel | npm / pnpm tag | Purpose |
|---|---|---|---|
| `<version>-preview.N` | Preview | `next` | Early adopters, feature branches, CI testing |
| `<version>` | Stable | `latest` | Production releases, default installation |

- **Preview builds**: Increment `N` (`0.6.0-preview.1` → `0.6.0-preview.2`) for every incremental preview publish.
- **Promoting to Stable**: Running a stable release promotes `0.6.0-preview.N` → `0.6.0`.
- **Semver Bumps**: When bumping `patch`, `minor`, or `major`, preview numbers reset to `1` (e.g. `0.6.0` → `0.7.0-preview.1`).

---

## 🧠 Smart Git Diff Detection

The release script detects which packages were modified since their last release by inspecting git history:

1. **Package Base Discovery**: Finds the latest tag matching `@beechcms/<pkg>@*` or `<pkg>@*` (or the last commit that touched `<package-dir>/package.json`).
2. **Git Diff Inspection**: Runs `git diff --name-only <baseRef>..HEAD -- <package-dir>` (and checks uncommitted working tree changes).
3. **Selective Bumping & Publishing**:
   - Only packages with file modifications are bumped and published to npm.
   - Unchanged packages are skipped (`💤 unchanged`).
4. **Dependency Cascading**:
   - When a package is bumped, all workspace dependencies pointing to it (`workspace:^<version>`) are automatically updated across all `package.json` files.
   - Consumer packages are automatically cascaded for a patch release (configurable via `--no-cascade`).
   - Special case: When `apps/dashboard` changes, `@beechcms/api` is automatically marked for release because compiled dashboard assets are bundled into `@beechcms/api`.

---

## 📋 Monorepo Packages

| Package | Directory | Published to npm | Description |
|---|---|---|---|
| `@beechcms/core` | `packages/core` | ✅ Yes | Botanical Engine, types, validation |
| `@beechcms/client` | `packages/client` | ✅ Yes | Universal TypeScript HTTP SDK & subpaths |
| `@beechcms/forms-react` | `packages/forms-react` | ✅ Yes | Secure React form toolkit & anti-bot |
| `@beechcms/widget-sdk` | `packages/widget-sdk` | ✅ Yes | Custom dashboard widgets SDK |
| `@beechcms/cli` | `packages/cli` | ✅ Yes | `npx beech` CLI (seed:load, forms, etc.) |
| `@beechcms/api` | `apps/api` | ✅ Yes | Worker factory, migrations, dashboard bundle |
| `@beechcms/dashboard` | `apps/dashboard` | ❌ No | Bundled into `@beechcms/api/assets/dashboard` |
| `@beechcms/cms` | `.` (root) | ✅ Yes | Root scaffolder (`npx @beechcms/cms`) |

---

## 🚀 The Release Script

Located at `scripts/release.mjs`.

### Syntax

```bash
node scripts/release.mjs [bump] [options]
```

Or via pnpm shortcuts:

```bash
pnpm release                 # Stable release for modified packages
pnpm release:preview         # Preview release for modified packages
pnpm release patch           # Bump patch on modified packages
pnpm release minor           # Bump minor on modified packages
pnpm release major           # Bump major on modified packages
```

### Subcommands & Manual Management

| Command | Usage | Description |
|---|---|---|
| `list`, `ls` | `pnpm release list` | Displays a table of all packages, current versions, npm publish status, and git changes |
| `get` | `pnpm release get [pkg]` | Displays the current version for a package (or all packages if omitted) |
| `set` | `pnpm release set <pkg> <version>` | Sets the exact version for a package, updates internal dependencies across the workspace, and syncs lockfile |

### Release CLI Options & Flags

| Flag / Option | Alias | Description |
|---|---|---|
| `--preview` | | Publish to `next` tag with `-preview.N` suffix |
| `--dry-run` | | Simulate all steps (change detection, version math, tags) without modifying files or publishing |
| `--bump <type>` | `patch`, `minor`, `major` | Explicit semver increment type |
| `--filter <pkg>` | `-p <pkg>` | Target specific package(s), comma-separated (e.g. `-p client` or `-p client,forms-react`) |
| `--all` | `--force` | Force bump and release of ALL packages regardless of git diff |
| `--no-cascade` | | Do not bump dependent packages when an upstream package is bumped |
| `--since <ref>` | | Custom git ref/commit to compare diff against (default: auto-detected per package) |
| `--help` | `-h` | Display help manual |

---

## 🛠️ Version Management Examples

```bash
# List all packages in monorepo, versions, and modified status
pnpm release list

# Get current version of a package
pnpm release get client

# Manually set an exact version and auto-sync workspace dependencies
pnpm release set client 0.8.0-preview.2
```

---

## 💡 Common Workflows

### 1. Release only changed packages (Standard Stable Release)

```bash
# Releases only packages with git modifications since their last release
pnpm release patch
```

### 2. Preview Release

```bash
# Bumps preview number (-preview.N) on modified packages and publishes to npm @next
pnpm release:preview
```

### 3. Release a Single Specific Package

```bash
# Target only @beechcms/client
pnpm release -p client patch

# Or preview release for a single package
pnpm release -p forms-react --preview
```

### 4. Monorepo-Wide Release (Force All)

```bash
# Bumps and publishes all packages
pnpm release --all minor
```

### 5. Dry-Run Simulation

```bash
# View the release plan table without modifying any files
pnpm release --dry-run patch
```

---

## 🔄 Release Execution Pipeline

When executed, the script performs the following atomic steps:

1. **Diff Detection & Plan Display**: Analyzes git history and prints a table of changes and planned version increments.
2. **Version Bump & Dependency Sync**: Updates `"version"` in manifests and syncs all internal `workspace:^<version>` references.
3. **License Update**: Updates the Change Date in `.github/LICENSE`.
4. **Lockfile Refresh**: Runs `pnpm install --no-frozen-lockfile` to ensure lockfile integrity.
5. **Build & Validation**: Runs `turbo run type-check --force` and `turbo run build --force`.
6. **Dashboard Asset Copy**: Copies compiled admin dashboard (`apps/dashboard/dist/admin`) into `@beechcms/api/assets/dashboard`.
7. **NPM Publish**: Publishes each bumped package to pnpm with `--access public --tag <next|latest>`.
8. **Git Commit & Tags**:
   - Commits modified `package.json` files and lockfile.
   - Tags each published package with `@beechcms/<pkg>@<version>`.
   - Tags root release `v<version>` when applicable.

---

## 🛡️ Atomic Rollback Safety

If any failure occurs during type checking, building, or lockfile installation:
- The script automatically **restores all `package.json` files and `.github/LICENSE`** to their exact pre-release snapshot.
- No partial file changes are left behind.
