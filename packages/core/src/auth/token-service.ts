export interface JwtClaims {
  sub: string
  email?: string
  name?: string
  [key: string]: unknown
}

export interface IssueTokenOptions {
  /** Time to live in seconds. Defaults to 900 (15 minutes). */
  ttlSeconds?: number
}

export interface ITokenService {
  /**
   * Issues a signed JWT for the given claims. The token is short-lived by design;
   * callers that need a longer-lived session should use a refresh token instead.
   */
  issue(claims: JwtClaims, options?: IssueTokenOptions): Promise<string>

  /**
   * Verifies a JWT and returns its decoded claims, or null on ANY failure
   * (expired, tampered, wrong issuer/audience, malformed). Never throws.
   */
  verify(token: string): Promise<JwtClaims | null>
}
