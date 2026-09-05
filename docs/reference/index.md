# Reference Hub

Technical contracts, specifications, and API reference documentation for the BeechCMS ecosystem.

BeechCMS exposes two primary API surfaces:
- **Internal API**: JWT-authenticated endpoints used by the dashboard and administrative tools.
- **Public API**: Hardened, API-key-gated endpoints with RFC 9457 Problem Details for external applications and headless frontends.

---

## Base URLs & Environments

| Environment | Base URL | Description |
|---|---|---|
| Local (Wrangler dev) | `http://localhost:8787` | Local development and testing environment |
| Production | Deployment-specific | Configured via Cloudflare Workers custom domain / route |

All endpoints are served from a single edge Worker orchestrated with Hono.

---

## Core Reference

Foundational technical specifications, security models, and architectural patterns.

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 20px 0;">

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/security-stack">Security Stack</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    JWT HMAC-SHA256 authentication, single-use refresh token rotation protocol, rate limiting, and security hardening summary.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/error-model">Error Model</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    RFC 7807 Problem Details specification, standard error type URIs, validation envelopes, and HTTP status code mappings.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/architecture">Technical Architecture</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Vertical Slice Architecture, Content Repository pattern, programmatic lifecycle hooks, and Cloudflare D1 transaction semantics.
  </p>
</div>

</div>

---

## API Endpoints

Technical contracts and schemas for content operations, authentication, media, and dynamic schemas.

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 20px 0;">

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/auth-endpoints">Auth Endpoints</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    <code>/auth/login</code>, <code>/auth/refresh</code>, <code>/auth/logout</code>, feature detection, and password reset flows with Resend/Mailpit.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/internal-content">Internal Content API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    CRUD endpoints for content records, field alias resolution, hashed field rotation, and pending draft lifecycles.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/public-api">Public API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Hardened <code>/api/v1/public/*</code> routes with capability flags, read/write API key splits, filtering, and idempotency guarantees.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/media-engine">Media Engine</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Cloudflare R2 and S3-compatible presigned upload URLs (SigV4), confirmation workflows, proxy streaming, and storage metrics.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv); grid-column: 1 / -1;">
  <h3 style="margin-top: 0;"><a href="/reference/seed-builder">Seed Builder & Schema Mutation API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Dynamic DDL schema evolution, table creation, column renames, type rebuilding, FTS5 index reconstruction, and orphan column detection.
  </p>
</div>

</div>

---

## Extensions

Contracts for dashboard widgets, event triggers, and layout persistence.

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 20px 0;">

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/widget-api">Widget API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Aggregation queries, growth metrics, leaderboards, time-series data, and categorical distribution endpoints.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/automations-api">Automations API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Event-driven triggers (create, update, delete, cron) and action executors (webhooks, email dispatch, field mutations).
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/dashboard-layout">Dashboard Layout API</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Dashboard Composer layouts, role-based scope resolution chains, validation schemas, and auto-cleanup mechanisms.
  </p>
</div>

</div>

---

## Official SDKs & APIs

Typed client packages and generated API reference.

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 20px 0;">

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/reference/client-sdk">Client SDK (@beechcms/client)</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Submodule-segregated TypeScript SDK for isomorphic querying, mutation, HMAC webhook verification, and TipTap AST rendering.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/api/">TypeScript API (TypeDoc)</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Auto-generated TypeDoc reference for all BeechCMS monorepo packages (core, client, forms-react, search-client, widget-sdk, cli).
  </p>
</div>

</div>

