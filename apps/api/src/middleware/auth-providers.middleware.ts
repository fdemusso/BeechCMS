import { createMiddleware } from 'hono/factory'
import type { IHashProvider, ITokenService } from '@beechcms/core'
import type { AppEnv } from '../types'
import { BcryptHashProvider } from '../auth/bcrypt-hash-provider'
import { JoseTokenService } from '../auth/jose-token-service'

export interface AuthProviderOverrides {
  hashProvider?: IHashProvider
  tokenService?: ITokenService
}

export const authProvidersMiddleware = (overrides?: AuthProviderOverrides) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    const hashProvider = overrides?.hashProvider ?? new BcryptHashProvider()
    const tokenService = overrides?.tokenService ?? new JoseTokenService(context.env.JWT_SECRET, {
      issuer: context.env.JWT_ISSUER,
      audience: context.env.JWT_AUDIENCE,
    })

    context.set('hashProvider', hashProvider)
    context.set('tokenService', tokenService)

    await next()
  })
}
