import { SignJWT, jwtVerify } from 'jose'
import type { ITokenService, IssueTokenOptions, JwtClaims, IClock } from '@beechcms/core'

const DEFAULT_TOKEN_TTL_SECONDS = 900
const DEFAULT_ALGORITHM = 'HS256' as const

export interface JoseTokenServiceConfig {
  issuer?: string
  audience?: string
  algorithm?: 'HS256' | 'HS384' | 'HS512'
}

export class JoseTokenService implements ITokenService {
  private readonly secretBytes: Uint8Array
  private readonly config: JoseTokenServiceConfig
  private readonly clock: IClock

  constructor(secret: string, config: JoseTokenServiceConfig, clock: IClock) {
    this.secretBytes = new TextEncoder().encode(secret)
    if (this.secretBytes.length < 32) {
      throw new Error('JWT secret must be at least 32 bytes (256-bit)')
    }
    this.config = config
    this.clock = clock
  }

  async issue(claims: JwtClaims, options?: IssueTokenOptions): Promise<string> {
    const { sub, ...remainingClaims } = claims
    const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    const algorithm = this.config.algorithm ?? DEFAULT_ALGORITHM
    const issuedAtSeconds = this.clock.nowSeconds()

    let builder = new SignJWT(remainingClaims)
      .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
      .setSubject(sub)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(issuedAtSeconds + ttlSeconds)

    if (this.config.issuer) builder = builder.setIssuer(this.config.issuer)
    if (this.config.audience) builder = builder.setAudience(this.config.audience)

    return builder.sign(this.secretBytes)
  }

  async verify(token: string): Promise<JwtClaims | null> {
    try {
      const algorithm = this.config.algorithm ?? DEFAULT_ALGORITHM
      const { payload } = await jwtVerify(token, this.secretBytes, {
        algorithms: [algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience,
      })
      return payload as JwtClaims
    } catch {
      return null
    }
  }
}
