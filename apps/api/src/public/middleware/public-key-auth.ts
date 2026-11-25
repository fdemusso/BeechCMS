// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import { timingSafeEqual } from '@beechcms/core'
import type { Env } from '../../types.js'
import { PUBLIC_ERRORS } from '../errors/public-errors.js'
import { publicProblem } from '../errors/problem-details.js'

/** Local development values. Public by design: the secret one is refused outside ENV=development. */
export const DEV_PUBLISHABLE_KEY = 'beech_pk_dev'
export const DEV_SECRET_KEY = 'beech_sk_dev'

/** One stable line, logged on every request refused by the dev-secret guard. Never carries the key value. */
export const PUBLIC_KEY_DEV_SECRET_WARNING =
  '[public-api] refused BEECH_SECRET_KEY: it is the local development value and ENV is not "development". Set a generated key with `wrangler secret put BEECH_SECRET_KEY`.'

export type PublicKeyRole = 'secret' | 'publishable'

export type PublicKeyDenialType =
  | 'public-api-not-configured'
  | 'public-api-key-unauthorized'
  | 'public-api-secret-key-required'
  | 'public-api-dev-secret-key'

export type PublicKeyDecision =
  | { ok: true; role: PublicKeyRole }
  | { ok: false; status: 401 | 403; type: PublicKeyDenialType; write: boolean }

export type PublicKeyBindings = Pick<Env, 'BEECH_PUBLISHABLE_KEY' | 'BEECH_SECRET_KEY' | 'ENV'>

export function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function nonBlank(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== '' ? value : undefined
}

/**
 * Decides whether an `X-API-Key` value may perform a request. Pure: the middleware and the
 * add handler share this decision so the two paths cannot diverge.
 */
export function authorizePublicKey(input: {
  method: string
  providedKey: string | undefined
  env: PublicKeyBindings
}): PublicKeyDecision {
  const { method, env } = input
  const providedKey = nonBlank(input.providedKey)
  const secretKey = nonBlank(env.BEECH_SECRET_KEY)
  const publishableKey = nonBlank(env.BEECH_PUBLISHABLE_KEY)
  const write = !isReadMethod(method)

  if (providedKey && secretKey && timingSafeEqual(providedKey, secretKey)) {
    if (env.ENV !== 'development' && secretKey === DEV_SECRET_KEY) {
      return { ok: false, status: 403, type: 'public-api-dev-secret-key', write }
    }
    return { ok: true, role: 'secret' }
  }

  if (providedKey && publishableKey && timingSafeEqual(providedKey, publishableKey)) {
    if (!write) return { ok: true, role: 'publishable' }
    return { ok: false, status: 403, type: 'public-api-secret-key-required', write }
  }

  const notConfigured = write ? !secretKey : !secretKey && !publishableKey
  if (notConfigured) {
    return { ok: false, status: 403, type: 'public-api-not-configured', write }
  }
  return { ok: false, status: 401, type: 'public-api-key-unauthorized', write }
}

/** Turns a denial into its Problem Details response; the dev-secret guard also logs one warning. */
export function publicKeyProblem(c: Context, denial: Extract<PublicKeyDecision, { ok: false }>) {
  switch (denial.type) {
    case 'public-api-key-unauthorized':
      return publicProblem(c, {
        type: denial.type,
        title: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.error,
        status: 401,
        detail: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.message,
      })
    case 'public-api-not-configured': {
      const notConfigured = denial.write ? PUBLIC_ERRORS.PUBLIC_NOT_CONFIGURED_WRITE : PUBLIC_ERRORS.PUBLIC_NOT_CONFIGURED_READ
      return publicProblem(c, { type: denial.type, title: notConfigured.error, status: 403, detail: notConfigured.message })
    }
    case 'public-api-secret-key-required':
      return publicProblem(c, {
        type: denial.type,
        title: PUBLIC_ERRORS.SECRET_KEY_REQUIRED.error,
        status: 403,
        detail: PUBLIC_ERRORS.SECRET_KEY_REQUIRED.message,
      })
    case 'public-api-dev-secret-key':
      console.warn(PUBLIC_KEY_DEV_SECRET_WARNING)
      return publicProblem(c, {
        type: denial.type,
        title: PUBLIC_ERRORS.DEV_SECRET_KEY.error,
        status: 403,
        detail: PUBLIC_ERRORS.DEV_SECRET_KEY.message,
      })
  }
}
