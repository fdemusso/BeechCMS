/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config'

// `cloudflare:test`'s `env` export is typed as the global `Cloudflare.Env` namespace
// (populated here by hand — the api worker has no wrangler-generated worker-configuration.d.ts).
// `declare global` is required: this file is a module (it has a top-level import), so a bare
// `declare namespace Cloudflare` would scope to this file instead of merging globally.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
