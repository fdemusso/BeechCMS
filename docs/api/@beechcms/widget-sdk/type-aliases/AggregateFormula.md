[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / AggregateFormula

# Type Alias: AggregateFormula

> **AggregateFormula** = \{ `op`: `"count"`; \} \| \{ `column`: `string`; `op`: `"sum"`; \} \| \{ `column`: `string`; `op`: `"avg"`; \} \| \{ `column`: `string`; `op`: `"min"`; \} \| \{ `column`: `string`; `op`: `"max"`; \} \| \{ `column`: `string`; `op`: `"countWhere"`; `value`: `unknown`; \} \| \{ `denominatorColumn`: `string`; `numeratorColumn`: `string`; `op`: `"percentageOf"`; \}

Discriminated union describing the aggregate to compute over a content table.

The widget routes accept this shape from the dashboard. Implementations are
responsible for translating each variant into a safe SQL expression and must
never interpolate the column or value fields without prior validation.
