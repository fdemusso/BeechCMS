# Schema Manifest (`beech.schema.ts`)

`beech.schema.ts` is a **typed, declarative, version-controlled description of your content model**. You author it with the DSL exported from `@beechcms/core/schema`, review it in Git like any other source file, and reconcile it with the database through an explicit plan-and-apply step.

> [!IMPORTANT]
> The manifest is **desired state, not runtime authority**. D1 remains the single runtime source of truth: the Worker never imports `beech.schema.ts`, and no deploy applies it. Nothing changes in your database until you run `beech schema apply`.

That separation is what the file buys you: portability, backup, code review on schema changes, and a bootstrap artifact for a fresh environment — without reintroducing a static `seeds.ts` the runtime depends on.

---

## The DSL

```bash
pnpm add @beechcms/core
```

| Helper | Purpose |
| :--- | :--- |
| `defineSchema({ seeds })` | Declares the root manifest. Stamps the manifest `version` for you |
| `defineSeed({ ... })` | Declares one content type (a Seed) and its branches |
| `defineField.<type>({ ... })` | Typed field constructors, one per branch type |
| `defineGroup(name, branches)` | A reusable field bundle, expanded at author time |

> [!WARNING]
> Import from **`@beechcms/core/schema`**, not `@beechcms/core`. The package root exports a legacy `defineSeed(seed: Seed): Seed` identity helper that takes the engine's `Seed` shape — including mandatory `br_*` branch ids. Importing that one into a manifest produces confusing type errors on every field.

Every helper is **pure and allocation-only**: it gives you inference and autocomplete, and never validates, throws, or performs I/O. `defineSchema()` erases to a plain `BeechSchemaManifest` object — a JSON-serializable value with no executable code in it.

### A complete manifest

```typescript
// beech.schema.ts
import { defineSchema, defineSeed, defineField, defineGroup } from '@beechcms/core/schema'

// A bundle shared by several seeds. Author-time only — it leaves no trace in the database.
const seo = defineGroup('seo', [
  defineField.text({ alias: 'meta_title', label: 'Meta title' }),
  defineField.text({ alias: 'meta_description', label: 'Meta description' }),
])

export default defineSchema({
  seeds: [
    defineSeed({
      slug: 'authors',
      label: 'Author',
      labelPlural: 'Authors',
      displayNameAlias: 'name',
      allowPublicRead: true,
      branches: [
        defineField.text({ alias: 'name', label: 'Name', requiredOnCreate: true }),
        defineField.richtext({ alias: 'bio', label: 'Biography' }),
        defineField.text({
          alias: 'private_email',
          label: 'Contact email',
          policies: { classification: 'Confidential', privacy: 'encrypt', public: false },
        }),
      ],
    }),

    defineSeed({
      slug: 'posts',
      label: 'Post',
      labelPlural: 'Posts',
      displayNameAlias: 'title',
      allowPublicRead: true,
      allowDrafts: true,
      branches: [
        defineField.text({ alias: 'title', label: 'Title', requiredOnCreate: true }),
        defineField.richtext({ alias: 'body', label: 'Body' }),
        defineField.file({ alias: 'cover', label: 'Cover image' }),
        defineField.tags({ alias: 'tags', label: 'Tags' }),
        defineField.relation({
          alias: 'author',
          label: 'Author',
          targetSeed: 'authors',
          onDelete: 'SET NULL',
        }),
        seo, // splices meta_title + meta_description into this seed's branch list
      ],
    }),
  ],
})
```

### Seed options

| Key | Type | Notes |
| :--- | :--- | :--- |
| `slug` | `string` | **Required.** Also the physical table name: `content_{slug}` |
| `label` | `string` | **Required.** Singular UI label |
| `labelPlural` | `string` | Falls back to `label` |
| `displayNameAlias` | `string` | **Required.** Alias of the branch used as the entry's human-readable name |
| `allowPublicRead` | `boolean` | Enables `GET /api/v1/public/:seed`. Default `false` |
| `allowPublicPost` | `boolean` | Enables `POST /api/v1/public/:seed/add`. Default `false` |
| `allowPublicEdit` | `boolean` | Enables `PUT /api/v1/public/:seed/edit/:id`. Default `false` |
| `allowDrafts` | `boolean` | Generates the `content_{slug}_drafts` staging table. Default `false` |
| `softDelete` | `boolean` | Provisions the `deleted_at` column and turns `DELETE` into a reversible move to the [Trash](/features/trash). Default `false`. Compared by `beech schema diff`, so flipping it shows up as drift |
| `retentionDays` | `number` | Retention window before automatic cleanup / anonymization. Drives the Trash countdown when `softDelete` is on |
| `branches` | `ManifestBranch[]` | **Required.** Order is preserved — it is the physical column order |

### Branch constructors

| Constructor | Branch type | Constructor-specific requirement |
| :--- | :--- | :--- |
| `defineField.text()` | `text` | — |
| `defineField.number()` | `number` | `numberOptions` for min/max/step |
| `defineField.boolean()` | `boolean` | — |
| `defineField.date()` | `date` | `format: 'date' \| 'datetime'` |
| `defineField.richtext()` | `richtext` | Stores a TipTap AST envelope |
| `defineField.json()` | `json` | — |
| `defineField.file()` | `file` | `multiple: true` for an asset list |
| `defineField.tags()` | `tags` | `options` for a fixed vocabulary |
| `defineField.relation()` | `relation` | **`targetSeed` is required** at compile time |
| `defineField.repeater()` | `repeater` | **`fields` is required** at compile time |

Common branch keys: `alias` (the API field name and SQL column), `label`, `hint`, `requiredOnCreate`, `requiredOnUpdate`, `multiple`, `options`, `format`, `policies`, `targetSeed`, `onDelete`, `fields`.

`relation` and `repeater` narrow their input deliberately: the compiler enforces up front what `apply` would otherwise only reject at plan time.

> [!NOTE]
> **Never write a branch `id`.** `br_01`-style ids are optional in the manifest and are filled in only so validation sees a complete Seed. The authoritative id assignment happens at apply time, where the stored id is matched **by alias** before any new one is minted. A hand-invented id collides with what the engine already minted.

### Field groups are macros

`defineGroup()` exists so an SEO block (or an address block, or an audit block) is written once. `defineSeed()` splices its branches into the seed's own list at author time, and the group leaves **zero trace** in the canonical JSON or the database. D1 has exactly one grouping mechanism, and this is not it.

---

## The manifest loop

```bash
# 1. Snapshot the live schema into a reviewable file
npx beech schema export                 # → beech.schema.ts

# 2. Edit the manifest, commit it, open a PR

# 3. What differs between the manifest and the deployed schema? (exit 1 on drift)
npx beech schema diff

# 4. What DDL would applying it run? (writes nothing)
npx beech schema plan

# 5. Apply through the control plane
npx beech schema apply

# 6. Refresh consumer types from the new live state
npx beech types generate
```

`export` sorts seeds by slug and emits canonical JSON, so two exports of the same database are byte-identical and a Git diff shows schema change only — never serializer noise. The exported file imports `defineSchema` and embeds the seed payload as a JSON literal rather than a tree of `defineField` calls; a hand-authored manifest and an exported one erase to the same value.

> [!WARNING]
> **The additive invariant holds here too.** `apply` never deletes a seed that is absent from the manifest, and never performs a drop, rename, or retype. Removing a field from `beech.schema.ts` does **not** drop the column — the server refuses destructive intent and names the endpoint that can perform it. See [Danger Zone Operations](/build/schema-modeling#danger-zone-operations).

The CLI never executes SQL and never opens D1 directly: every write goes through the control plane (`POST /api/seeds/:slug/mcp-*`). The first `plan` or `apply` authorizes the `beech-mcp-cli` OAuth client once; the grant is cached in `~/.beechcms/mcp-tokens.json` and revocable from **Settings → Connected apps**.

---

## Programmatic use

The same module powers the CLI, so scripts and CI jobs can use it directly:

| Export | Purpose |
| :--- | :--- |
| `validateManifest(manifest)` | Returns `SeedValidationIssue[]` — version check, serializability, and the engine's whole-set validation including cross-seed relation targets. Never throws |
| `toCanonicalJson(manifest)` / `fromCanonicalJson(json)` | Deterministic serialization round trip |
| `manifestToSeeds(manifest)` / `seedsToManifest(seeds)` | Bridge to the engine's `Seed[]` shape |
| `emitManifestModule(manifest)` | Renders the `beech.schema.ts` module source |

```typescript
import { validateManifest } from '@beechcms/core/schema'
import manifest from './beech.schema'

const issues = validateManifest(manifest)
const fatal = issues.filter((issue) => issue.fatal)

if (fatal.length > 0) {
  for (const issue of fatal) console.error(`${issue.slug}: ${issue.messages.join(', ')}`)
  process.exit(1)
}
```

Validation is cross-seed on purpose: a `relation` whose `targetSeed` does not exist in the manifest is caught here, before a plan is ever requested.

---

## Related Guides

- [Schema Modeling & Evolution](/build/schema-modeling) — Seed and Branch semantics, the compilation pipeline, danger-zone operations.
- [CLI Workflows](/build/cli-workflows) — the full command matrix and GitOps automation.
- [Field Policies & Encryption](/build/field-policies) — what `policies` does to storage and API visibility.
- [Client SDK](/reference/client-sdk) — consuming the generated types with the fluent query builder.
