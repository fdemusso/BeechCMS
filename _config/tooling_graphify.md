# Tooling: Graphify CLI (Reference Layer 3)

BeechCMS uses a knowledge graph (`graphify-out/`) for architectural discovery (~3k nodes, ~5k edges extracted via AST).
Your sole purpose with this tool is structural and relational mapping across the Vertical Slice Architecture.

## Environment
Always use the virtual environment before executing: `.\venv\Scripts\activate` (Windows)

## Maintenance & Regeneration
- **Update Graph**: `graphify update . --force` (AST-only). Use `--force` when files are deleted/ignored.
- **Full Clean Rebuild**: Run `.\venv\Scripts\python.exe scratch\build_beech_graph.py`. Wipes output, honors `.graphifyignore`, regenerates report and Obsidian vault.
- **Obsidian Export**: `.\venv\Scripts\python.exe -m graphify export obsidian --dir graphify-obsidian`

## When to use Graphify vs Direct Tools
- **USE GRAPHIFY FOR:** Architectural connections, identifying "God Nodes", cross-slice dependency checks, and conceptual domain logic discovery.
- **USE DIRECT TOOLS:** (grep, view_file, etc.) ONLY for reading specific implementation code, exact file lookups, or line-by-line debugging AFTER the architecture is understood.

### Decision Heuristic (READ FIRST — avoids wasted queries)
- **If you already know the exact symbol name** (function, type, const, schema) → use `grep`/`Read` DIRECTLY. Do NOT open with `graphify query`. Graphify earns its cost only when you need *relations you don't yet know* (who imports X, what breaks if X changes, the chain A→B).
- **`query` is a last resort, not a first probe.** Reach for it only after `explain`/`path`/`affected` cannot answer. A `query` you run to "discover storage/wiring" when you already know the symbol name is almost always wasted budget and context noise.
- **Prefer `path "A" "B"` over manual grep** when the question is "does A reach/depend-on B" (e.g. verifying a VSA boundary). It is cleaner and cheaper than reconstructing the chain by hand.
- **Nodes are per-SYMBOL, not per-FILENAME.** `explain "view-config.ts"` returns `No node matching`. Pass a symbol (`explain "getViewConfigHandler"`) or the bare module concept, never a `*.ts` path.

## ABSOLUTE RULES & AUTHORIZED COMMANDS
- **NEVER** read `GRAPH_REPORT.md` directly (it will saturate your context).
- **NEVER** execute `graphify --help` or invent flags.
- Execute ONLY the following commands, strictly in this order of preference:

### 1. `graphify explain "<NodeName>"` (1st Choice)
- **Purpose:** Get a plain-language explanation of a specific entity (e.g., a specific module or Botanical Engine alias) and its immediate neighbors.
- **Usage:** `graphify explain "AuthMiddleware"`

### 2. `graphify path "<NodeA>" "<NodeB>"` (2nd Choice)
- **Purpose:** Find the exact dependency chain between two specific nodes to ensure Vertical Slice architectural boundaries aren't violated.
- **Usage:** `graphify path "UserController" "D1Database"`

### 3. `graphify affected "<NodeName>"` 
- **Purpose:** Reverse traversal to find which files/nodes will break if `<NodeName>` is modified.
- **Usage:** `graphify affected "PostSchema" --depth 2` (Keep depth <= 3).

### 4. `graphify query "<Specific_Technical_Question>"` (LAST RESORT)
- **Purpose:** Semantic traversal for scoped questions.
- **WARNING:** This command is highly dangerous for the context window.
- **MANDATORY Flags:** You MUST append `--dfs --budget 1500` to prevent breadth-first explosion and context saturation.
- **Usage:** `graphify query "How does authentication write to the D1 database?" --dfs --budget 1500`

### 5. `graphify save-result`
- **Purpose:** Run this after a highly useful query to feed the outcome back into the project's memory loop.
- **Usage:** `graphify save-result --question "..." --answer "..." --outcome useful`
