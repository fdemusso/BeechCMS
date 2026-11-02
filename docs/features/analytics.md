---
title: Edge Analytics & System Telemetry
description: Edge-native request telemetry, media storage quotas, unused asset detection, and system health in BeechCMS.
---

# Edge Analytics & System Telemetry

BeechCMS operates directly at the edge, where traditional heavy Application Performance Monitoring (APM) agents or external logging services can introduce unacceptable latency or out-of-memory errors.

Instead, BeechCMS features an asynchronous, edge-native **System Telemetry & Analytics Engine** (`/stats` and `/analytics`):
- Non-blocking execution hooks (`waitUntil`) log edge traffic into Cloudflare D1 without delaying HTTP responses.
- Real-time aggregations provide per-Seed query volumes, storage utilization, and project health checks.
- Media auditing automatically discovers unreferenced or orphaned assets across Cloudflare R2.

<p align="center">
  <img src="/images/edge-analytics-pipeline.svg" alt="BeechCMS Non-Blocking Edge Telemetry Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Core Capabilities

- **Per-Seed Request Metrics**: Understand which content collections receive the highest read traffic over 24-hour, 7-day, and 30-day windows.
- **D1 & R2 Quota Tracking**: Real-time tracking of Cloudflare D1 query operations and R2 storage consumption (bytes and total objects) relative to account limits.
- **Unused Media Detection (`/stats/unused-media`)**: Cross-references files stored in R2 against every image/file branch across all Botanical Seeds. Unused or orphaned assets can be reviewed and deleted with a single click.
- **Setup & Health Checklist (`/stats/setup-checklist`)**: Verifies schema integrity, D1 database tables, a global administrator (`manage_users` at `*`), and seed table migrations.

---

## Telemetry Endpoints

The Stats slice is mounted at `/api/content`:

| Method | Endpoint | Required | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/content/stats/total` | Authenticated | Entry totals (all time, today, week, month) |
| `GET` | `/api/content/stats/breakdown` | Authenticated | Content distribution per seed for the "Content Pulse" widget |
| `GET` | `/api/content/stats/recent-activity` | Authenticated | Recent activity feed |
| `GET` | `/api/content/stats/media-library` | `content:read` at `*` | Unified media catalog with cross-seed references |
| `GET` | `/api/content/stats/unused-media` | `content:read` at `*` | Scans for orphaned files in R2 not referenced in any Fruit |
| `GET` | `/api/content/stats/setup-checklist` | `manage_users` at `*` | System health check (tables, seeds, admin status) |
| `GET` | `/api/content/stats/health` | `view_analytics` at `*` | System health status and Cloudflare quotas |
| `GET` | `/api/content/stats/cloudflare` | `view_analytics` at `*` | Visitors, requests and bandwidth over the last 30 days |
| `POST` | `/api/content/stats/storage/sync` | `view_analytics` at `*` | Recalculates the space occupied on R2 (expensive) |

`total`, `breakdown` and `recent-activity` are scope-projected per caller: see [Roles & Permissions](/manage/roles-permissions#platform-gates).

### Unused Media Scan Example

```http
GET /api/content/stats/unused-media
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "items": [
    {
      "key": "1717000000-a1b2-old-banner.webp",
      "filename": "old-banner.webp",
      "mime_type": "image/webp",
      "size_bytes": 458291,
      "created_at": 1717000000
    }
  ]
}
```

---

## Analytics Dashboard

In the BeechCMS Dashboard under **Analytics** (`/admin/analytics`), administrators can monitor:
1. **Traffic Velocity**: Charts showing total API requests over time.
2. **Top Performing Seeds**: Bar charts highlighting the most queried collections.
3. **Storage Utilization**: Storage gauge displaying current R2 bucket usage against limits.
4. **Maintenance Actions**: One-click cleanup of unused media identified during cross-seed scans.
