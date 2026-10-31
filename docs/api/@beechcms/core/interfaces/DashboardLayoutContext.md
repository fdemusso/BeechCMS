[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DashboardLayoutContext

# Interface: DashboardLayoutContext

## Properties

### knownWidgetTypes?

> `optional` **knownWidgetTypes?**: `ReadonlySet`&lt;`string`&gt;

Optional: widget types known to the caller (frontend registry).
 When provided, unknown types produce WARNINGS, never strips.

***

### roleIds?

> `optional` **roleIds?**: `ReadonlySet`&lt;`string`&gt;

Optional: ids of every existing role. When provided, a page naming an id outside this set
 is an ERROR (never stripped: emptying the list would make the tab public).

***

### seedSlugs

> **seedSlugs**: `ReadonlySet`&lt;`string`&gt;

Slugs of currently registered seeds (from ISeedRegistry.all()).
