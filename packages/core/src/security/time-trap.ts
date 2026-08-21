// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function generateTimeTrapToken(secret: string, timestampSeconds?: number): Promise<string> {
  const t0 = timestampSeconds ?? Math.floor(Date.now() / 1000)
  const payload = `t0_${t0}`
  const key = await getHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${payload}.${sigHex}`
}

export async function verifyTimeTrapToken(
  token: string,
  secret: string,
  minDeltaSeconds: number = 1.5,
  maxAgeSeconds: number = 3600
): Promise<{ valid: boolean; reason?: string; elapsedSeconds?: number }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing or invalid token format' }
  }
  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, reason: 'Malformed token structure' }
  }
  const [payload, sigHex] = parts
  if (!payload.startsWith('t0_')) {
    return { valid: false, reason: 'Invalid token prefix' }
  }

  const t0 = Number.parseInt(payload.slice(3), 10)
  if (!Number.isFinite(t0)) {
    return { valid: false, reason: 'Invalid timestamp value' }
  }

  const hexMatches = sigHex.match(/.{1,2}/g)
  if (!hexMatches || hexMatches.length !== 32) {
    return { valid: false, reason: 'Invalid signature encoding' }
  }

  const key = await getHmacKey(secret)
  const sigBytes = new Uint8Array(hexMatches.map(byte => parseInt(byte, 16)))
  const isValidSig = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
  if (!isValidSig) {
    return { valid: false, reason: 'Cryptographic signature mismatch' }
  }

  const now = Date.now() / 1000
  const elapsed = now - t0

  if (elapsed < minDeltaSeconds) {
    return { valid: false, reason: `Submission too fast (${elapsed.toFixed(2)}s < ${minDeltaSeconds}s)`, elapsedSeconds: elapsed }
  }
  if (elapsed > maxAgeSeconds) {
    return { valid: false, reason: `Token expired (${elapsed.toFixed(0)}s > ${maxAgeSeconds}s)`, elapsedSeconds: elapsed }
  }

  return { valid: true, elapsedSeconds: elapsed }
}
