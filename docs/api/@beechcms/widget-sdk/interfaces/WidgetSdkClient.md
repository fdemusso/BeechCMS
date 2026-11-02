[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / WidgetSdkClient

# Interface: WidgetSdkClient

Typed client contract the SDK's data hooks depend on: the `widget` subtree of the dashboard's
`hc` client (`rpc.api.widget`). It is declared here, structurally, so the SDK imports nothing
from the API; the host's `<WidgetSdkProvider client={...}>` only compiles while the server routes
still answer these shapes.

## Properties

### aggregate

> **aggregate**: `object`

#### :seed

> **:seed**: [`WidgetRoute`](WidgetRoute.md)&lt;`object` & [`WidgetWindowQuery`](WidgetWindowQuery.md), [`WidgetAggregateResponse`](WidgetAggregateResponse.md)&gt;

***

### distribution

> **distribution**: `object`

#### :seed

> **:seed**: [`WidgetRoute`](WidgetRoute.md)&lt;`object` & [`WidgetWindowQuery`](WidgetWindowQuery.md), [`WidgetDistributionResponse`](WidgetDistributionResponse.md)&gt;

***

### growth

> **growth**: `object`

#### :seed

> **:seed**: [`WidgetRoute`](WidgetRoute.md)&lt;`object` & [`WidgetWindowQuery`](WidgetWindowQuery.md), [`WidgetGrowthResponse`](WidgetGrowthResponse.md)&gt;

***

### list

> **list**: `object`

#### :seed

> **:seed**: [`WidgetRoute`](WidgetRoute.md)&lt;\{ `limit`: `string`; `offset`: `string`; `orderBy?`: `string`; `orderDir?`: `string`; `search?`: `string`; \}, [`WidgetListResponse`](WidgetListResponse.md)&gt;

***

### timeseries

> **timeseries**: `object`

#### :seed

> **:seed**: [`WidgetRoute`](WidgetRoute.md)&lt;`object` & [`WidgetWindowQuery`](WidgetWindowQuery.md), [`WidgetTimeseriesResponse`](WidgetTimeseriesResponse.md)&gt;
