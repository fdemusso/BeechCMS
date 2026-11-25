// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Local Public API keys. The same values as the scaffolder (`bin/template.mjs`) and the docs. */
export const DEV_PUBLISHABLE_KEY = 'beech_pk_dev'
export const DEV_SECRET_KEY = 'beech_sk_dev'

/** Key names 0.10.x scaffolds wrote in `wrangler.jsonc` vars; the runtime no longer reads them. */
export const LEGACY_KEY_VARS = ['PUBLIC_READ_API_KEY', 'PUBLIC_WRITE_API_KEY'] as const

/** Secrets 0.10.x committed in `wrangler.jsonc` vars; `keys:migrate` moves them to `.dev.vars` with fresh values. */
export const EXPOSED_SECRET_VARS = ['JWT_SECRET', 'PUBLIC_TIME_TRAP_SECRET'] as const

/** Secrets production must hold after the migration, in the order they are printed. Never `PRIVACY_MASTER_KEY`. */
export const MIGRATED_PRODUCTION_SECRETS = ['JWT_SECRET', 'BEECH_SECRET_KEY', 'PUBLIC_TIME_TRAP_SECRET'] as const

/** Names from LEGACY_KEY_VARS then EXPOSED_SECRET_VARS that are own keys of `vars`, in that order. */
export function legacyVarNames(vars: Record<string, unknown>): string[] {
  return [...LEGACY_KEY_VARS, ...EXPOSED_SECRET_VARS].filter((name) => Object.prototype.hasOwnProperty.call(vars, name))
}
