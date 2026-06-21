# Knowledge Graph (Graphify)

BeechCMS uses a knowledge graph (`graphify-out/`) for architectural discovery (~3k nodes, ~5k edges extracted via AST).

## Environment
Always use the virtual environment: `.\venv\Scripts\activate` (Windows)

## Maintenance & Regeneration
- **Update Graph**: `graphify update . --force` (AST-only). Use `--force` when files are deleted/ignored.
- **Full Clean Rebuild**: Run `.\venv\Scripts\python.exe scratch\build_beech_graph.py`. Wipes output, honors `.graphifyignore`, regenerates report and Obsidian vault.
- **Obsidian Export**: `.\venv\Scripts\python.exe -m graphify export obsidian --dir graphify-obsidian`

## Rules
- **Do NOT read** `GRAPH_REPORT.md` directly (too large). Use CLI commands.
- **Querying**: `graphify query "<question>"` for semantic search.
- **Paths**: `graphify path "A.ts" "B.ts"` to see how files connect.
- **Explain**: `graphify explain "symbol"` for specific connections.
- **Saving**: Run `graphify save-result` after a useful query to feed it back into memory.

## When to use graphify vs direct tools
- Architectural connections / God Nodes: Use `graphify path`, `query`, or `explain`.
- Reading code, file lookups: Use direct tools (grep, view_file).
