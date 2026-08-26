# 1. Feature Definition and Core Value

The BeechCMS TypeScript Type Generator provides a zero-drift, compile-time type safety mechanism by introspecting the authoritative Cloudflare D1 database (local SQLite state or remote D1) and emitting standard TypeScript definitions for all active content schemas.

In headless CMS architectures, frontend applications and consumers frequently suffer from schema drift caused by manually created TypeScript types or divergence between static backend source code and the active database schema. This feature eliminates schema drift, reduces maintenance overhead, and guarantees end-to-end type safety directly from the running database using an ergonomic CLI workflow aligned with modern developer expectations.

# 2. Domain Boundaries and Business Rules

### Logical Entities
* **CLI Type Command**: The entry point responsible for argument parsing, target environment resolution (local versus remote), and output stream/file dispatch.
* **D1 Schema Introspector**: A strictly read-only query client that reads active seed records directly from the database system table.
* **TypeScript Generator Engine**: A pure, deterministic transformation engine that parses seed definitions into valid TypeScript interfaces and registries.
* **Consumer Application**: Client applications (frontend web apps, scripts, CI/CD pipelines) importing or piping the generated types.

### Business Rules
* **Single Source of Truth**: The active Cloudflare D1 database (local or remote) is the sole authoritative source of schema information. Reading or interpreting static schema source files is strictly prohibited.
* **Strictly Read-Only Operation**: Schema extraction must only execute non-mutating queries and never alter, lock, or migrate the database state.
* **Pure Static Output**: The emitted definitions must consist exclusively of standard TypeScript interfaces and type aliases, containing zero runtime code, zero HTTP clients, and zero database connection credentials.
* **Deterministic Diff Stability**: Generated output must be sorted deterministically in alphabetical order by seed slug to prevent unnecessary version control diff churn.
* **Central Registry Contract**: All individual content interfaces must be registered within a central database registry interface named `BeechDatabase` (with `SeedRegistryTypes` retained as an alias for backwards compatibility).

# 3. Primary Requirements (User Stories)

* AS A frontend developer I WANT to execute a CLI command against my local database SO THAT I can instantly generate TypeScript interfaces matching my active local schema without manual maintenance
* AS A developer working with remote staging or production environments I WANT to target the remote database via a CLI flag SO THAT I can generate types reflecting the authoritative live environment
* AS A developer building pipeline workflows I WANT the CLI command to emit definitions to standard output by default SO THAT I can seamlessly pipe types into custom destination files or verification scripts
* AS A developer integrating with existing projects I WANT an optional output flag SO THAT I can write the generated definitions directly to a specified file path
* AS A full-stack engineer I WANT the generated output to expose a central database registry interface SO THAT I can achieve generic type-safe querying across all content collections

# 4. Secondary Requirements and Logical Constraints

### CLI Interface and Ergonomics
* Canonical command invocation must follow `beech gen types typescript` with support for the concise alias `beech gen-types`.
* Target environment selection must support `--local` (default behavior when omitted) and `--remote` (for live Cloudflare D1 targeting).
* Custom database name targeting must be supported via an optional `--db <name>` parameter.
* Output destination must default to standard output, with support for an optional `-o` / `--output <path>` argument to write directly to disk.

### Type Mapping Specifications
* **System Fields**: Each content interface must include mandatory system columns: `id` (string), `slug` (string), `status` (string literal union of `'draft' | 'review' | 'published' | 'archived'`), `created_at` (number), and `updated_at` (number).
* **Scalar Fields**: Primitive types must map accurately: `number` and `date` to `number`, `boolean` to `boolean`, `text` and `richtext` to `string`, and `json` to `unknown`.
* **String Literal Unions**: Fields with pre-configured vocabulary options must emit explicit string literal unions rather than generic strings.
* **Arrays and Tags**: Multiple-value fields (tag arrays, asset lists) must emit typed arrays.
* **Relations**: Relational fields must map to flat database representations: single relations as `string` and multiple relations as `string[]`.
* **Repeater Fields**: Repeater blocks must generate recursive arrays of objects representing the defined sub-field schema.
* **Optionality**: Fields without create-time requirement constraints must be marked with optional property indicators.

### Error Handling and Edge Cases
* **Missing Local State**: If local D1 SQLite state cannot be discovered (local development environment not running), the process must terminate with exit code 1 and output an actionable error message to standard error directing the user to start the local environment.
* **Uninitialized Database**: If the system seeds table is missing from the database, the process must terminate with exit code 1 and output an actionable error message directing the user to initialize the database.
* **Empty Active Seeds**: If the seeds table contains zero records with active status, the process must terminate with exit code 1 and output an actionable error message directing the user to load seeds.
* **Remote Query Failures**: If remote introspection fails due to missing Cloudflare credentials or network errors, the underlying error details must be routed to standard error with exit code 1.

# 5. Out of Scope (Discarded during sparring)

* **Static File Parsing**: Reading or evaluating static source files (such as `seeds.ts`) is completely excluded in favor of database-first introspection.
* **Relational Expansion and Join Types**: Generating nested, populated relational structures is excluded to preserve raw database schema accuracy and avoid runtime contract drift.
* **Multi-Tier Table Variations**: Generating separate `Row`, `Insert`, and `Update` types for each table is excluded in favor of a clean, lean single-entity model.
* **Runtime Client and SDK Generation**: Generating HTTP fetch wrappers, API SDK clients, or query builders is excluded to keep the output strictly focused on static typing.
* **Decoupled Standalone Repository Discovery**: Accommodating isolated repositories lacking monorepo or workspace configuration is excluded; the tooling operates within the workspace structure.
* **Excessive CLI Aliases**: Proliferation of redundant command aliases (`generate:types`, `gen types`) is excluded to maintain a concise, standardized CLI surface.
