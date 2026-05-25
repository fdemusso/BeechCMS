import type { ITokenService, IssueTokenOptions, JwtClaims } from '@beechcms/core'

const TEST_TOKEN_PREFIX = 'test:'

export class StaticTokenService implements ITokenService {
  private readonly issuedClaims = new Map<string, JwtClaims>()

  async issue(claims: JwtClaims, _options?: IssueTokenOptions): Promise<string> {
    const token = TEST_TOKEN_PREFIX + claims.sub
    this.issuedClaims.set(token, claims)
    return token
  }

  async verify(token: string): Promise<JwtClaims | null> {
    if (!token.startsWith(TEST_TOKEN_PREFIX)) return null
    return this.issuedClaims.get(token) ?? null
  }
}
