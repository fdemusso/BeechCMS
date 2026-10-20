[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / MAX\_DASHBOARD\_LAYOUT\_BYTES

# Variable: MAX\_DASHBOARD\_LAYOUT\_BYTES

> `const` **MAX\_DASHBOARD\_LAYOUT\_BYTES**: `number`

Max serialized size of a whole layout. Keeps the `dashboard_layouts` row
 far below D1's per-row limit and bounds the per-request cost of every GET.
