[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / TimeWindow

# Type Alias: TimeWindow

> **TimeWindow** = `"week"` \| `"month"` \| `"year"` \| `"all"`

Time range applied as a WHERE filter for widget queries.

"all" means no temporal restriction. The other values bracket the most recent
7 days, 1 month, and 1 year respectively, anchored on `created_at`.
