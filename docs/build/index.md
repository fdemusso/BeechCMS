# Building with BeechCMS

Design content models, enforce cryptographic field policies, extend the admin dashboard with custom widgets, and master developer workflows across the BeechCMS ecosystem.

BeechCMS empowers builders with a schema-driven architecture running completely on Cloudflare Workers, D1, and R2.

---

## Core Build Capabilities

Explore the key building blocks and engineering guides:

<div class="build-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 24px 0;">

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/build/schema-modeling">Schema Modeling & Evolution</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Define Seeds, configure Branches, and understand how the Botanical Engine compiles models into physical D1 tables and FTS5 search indexes.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/build/field-policies">Field Policies & Encryption</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Enforce granular branch security, AES-256-GCM Application-Level Encryption (ALE), blind indexing with HMAC-SHA256, and data classification tiers.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/build/custom-widgets">Custom Widgets SDK</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Extend the dashboard editor with sandboxed iframe widgets using <code>@beechcms/widget-sdk</code>, postMessage bridges, and manifests.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv);">
  <h3 style="margin-top: 0;"><a href="/build/cli-workflows">CLI Workflows</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Master the unified <code>beech</code> CLI for local emulation, database migrations, TypeScript type generation, form generation, and deployment.
  </p>
</div>

<div style="border: 1px solid var(--vp-c-border); border-radius: 8px; padding: 18px; background: var(--vp-c-bg-elv); grid-column: 1 / -1;">
  <h3 style="margin-top: 0;"><a href="/build/vertical-slice-architecture">Vertical Slice Architecture</a></h3>
  <p style="color: var(--vp-c-text-2); font-size: 0.9rem;">
    Explore the internal monorepo design principles: thin handlers, middleware injection, isolated feature slices, and strict zero-cross-import rules.
  </p>
</div>

</div>
