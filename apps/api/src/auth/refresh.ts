/// <reference types="@cloudflare/workers-types" />

export function generateRefreshToken(): string {
  return crypto.randomUUID()
}
