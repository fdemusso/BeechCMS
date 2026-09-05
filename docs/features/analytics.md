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
- **Setup & Health Checklist (`/stats/setup-checklist`)**: Verifies schema integrity, D1 database tables, admin user creation, and seed table migrations.

---

## Telemetry Endpoints

The Stats slice is mounted at `/api/content`:

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/content/stats/setup-checklist` | System health check (tables, seeds, admin status) |
| `GET` | `/api/content/stats/media-library` | Unified media catalog with cross-seed references |
| `GET` | `/api/content/stats/unused-media` | Scans for orphaned files in R2 not referenced in any Fruit |

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
