[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SearchSupport

# Type Alias: SearchSupport

> **SearchSupport** = \{ `mode`: `"fts"`; \} \| \{ `branch`: [`Branch`](../interfaces/Branch.md); `mode`: `"relation"`; `target`: [`Seed`](../interfaces/Seed.md); `targetBranch`: [`Branch`](../interfaces/Branch.md); \} \| \{ `mode`: `"none"`; \}

How a list search is answered for a seed:
- `fts`: the seed has indexable text/richtext branches, matched through its FTS table.
- `relation`: the seed shows a single relation as its display name, matched against the
  target's display name (plain text only).
- `none`: nothing searchable; the search term is ignored.
