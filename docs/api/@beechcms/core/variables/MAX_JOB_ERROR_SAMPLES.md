[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / MAX\_JOB\_ERROR\_SAMPLES

# Variable: MAX\_JOB\_ERROR\_SAMPLES

> `const` **MAX\_JOB\_ERROR\_SAMPLES**: `100` = `100`

Upper bound on per-row errors retained in a job report (brief §4). Beyond this only
the aggregate failure count grows, so one pathological file cannot unbound the row.
