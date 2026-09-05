---
title: Features Overview
description: Deep-dive into the architectural pillars, editorial capabilities, and vertical slices powering BeechCMS.
---

# Features

Deep-dive into the architectural pillars and capabilities powering the BeechCMS Botanical Engine. BeechCMS is built on **Vertical Slice Architecture (VSA)**, delivering decoupled, cohesive capabilities across the Cloudflare Workers API backend and the React admin dashboard.

---

## Content & Media Engine

- **[Drafts & Versioning Workflow](/features/drafts)**: Staged draft lifecycle, schema-validated partial updates, visual diff comparisons, and atomic publishing.
- **[Direct-to-R2 Media Engine](/features/media-engine)**: Zero-memory-footprint edge uploads to Cloudflare R2 / S3 storage via AWS SigV4 presigned URLs and cached CDN delivery.
- **[Relationships & Bidirectional Backrefs](/features/backrefs)**: Graph-aware relational tracking, inbound reference lookups ("Referenced By"), and cascade deletion guards.
- **[TipTap Rich Text Engine](/features/richtext-editor)**: Structured ProseMirror JSON AST output, inline image uploads, orphaned asset auto-cleanup, and XSS sanitization.

---

## Editorial Experience & Productivity

- **[Editorial Views: Kanban, Gallery & Bulk Actions](/features/editorial-views)**: Multi-perspective workflows with drag-and-drop Kanban status boards, visual asset galleries, and multi-step bulk edits.
- **[Command Palette (Cmd+K)](/features/command-palette)**: Keyboard-first spotlight navigation, fuzzy collection filtering, deep record search, and quick actions.

---

## Security, Workflows & Integrations

- **[Automations Engine](/features/automations)**: Trigger automated workflows, webhooks, and transactional emails on content lifecycle events or cron schedules.
- **[Forms SDK & Anti-Bot Protection](/features/forms)**: Zero-secret public form submissions with Time-Trap tokens and Honeypot defenses.
- **[Search SDK & Hybrid Search](/features/search)**: Edge-native vector semantic search and full-text hybrid search with `@beechcms/search-client`.
- **[Webhooks & Event Delivery](/features/webhooks)**: HMAC-SHA256 signed outbound event dispatching for Next.js on-demand ISR revalidation and Jamstack rebuilds.
- **[Confidential Data & Field Lifecycle](/features/confidential-data)**: GDPR-ready field privacy policies, salted hashes, and cryptographic field rotation without downtime.
- **[Edge Analytics & System Telemetry](/features/analytics)**: Non-blocking request telemetry, per-Seed traffic breakdowns, storage quotas, and unused media detection.
- **[Observability & Notifications](/features/observability)**: Asynchronous queues powered by Upstash QStash and immutable D1 activity audit logs.
- **[Email Module](/features/email-module)**: Decoupled transactional email delivery and templating with Resend and custom providers.
