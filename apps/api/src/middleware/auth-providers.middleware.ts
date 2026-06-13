// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { IHashProvider, ITokenService, IClock } from '@beechcms/core'
import { SystemClock } from '@beechcms/core'
import type { AppEnv } from '../types'
import { BcryptHashProvider } from '../auth/bcrypt-hash-provider'
import { JoseTokenService } from '../auth/jose-token-service'

export interface AuthProviderOverrides {
  hashProvider?: IHashProvider
  tokenService?: ITokenService
  clock?: IClock
}

// Valore di default presente in .dev.vars.example: mai accettabile in produzione.
const DEV_JWT_SECRET = 'sviluppo-secret-cambiami-almeno-32-byte-per-sicurezza-hono'

export const authProvidersMiddleware = (overrides?: AuthProviderOverrides) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    if (context.env?.ENV === 'production' && context.env?.JWT_SECRET === DEV_JWT_SECRET) {
      throw new Error(
        'JWT_SECRET non configurato: in produzione impostare un segreto univoco con `wrangler secret put JWT_SECRET`',
      )
    }

    const resolvedClock = overrides?.clock ?? SystemClock
    const hashProvider = overrides?.hashProvider ?? new BcryptHashProvider()
    const tokenService = overrides?.tokenService ?? new JoseTokenService(
      context.env.JWT_SECRET,
      {
        issuer: context.env.JWT_ISSUER,
        audience: context.env.JWT_AUDIENCE,
      },
      resolvedClock,
    )

    context.set('hashProvider', hashProvider)
    context.set('tokenService', tokenService)

    await next()
  })
}
