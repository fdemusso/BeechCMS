// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { timingSafeEqual } from '../../webhooks/webhook-crypto.js'

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Accepted clock drift, in steps, on each side of the current step (brief rule 6). */
export const TOTP_DRIFT_STEPS = 1
/** 160-bit secret, the RFC 4226 recommended length. */
export const TOTP_SECRET_BYTES = 20

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BITS_PER_BASE32_CHAR = 5
const TWO_POW_32 = 2 ** 32
const CODE_PATTERN = new RegExp(`^\\d{${TOTP_DIGITS}}$`)

export interface TotpUriInput {
  issuer: string
  accountName: string
  secret: string
}

export interface ITotpProvider {
  /** A fresh base32 (RFC 4648, upper case, no padding) secret of TOTP_SECRET_BYTES random bytes. */
  generateSecret(): string
  /**
   * The time step `code` matches within ±TOTP_DRIFT_STEPS of `unixSeconds`, or null.
   * Never throws on malformed codes; returns null.
   */
  verify(secret: string, code: string, unixSeconds: number): Promise<number | null>
  /** The standard `otpauth://totp/...` provisioning URI shown as QR and as a link. */
  buildUri(input: TotpUriInput): string
}

/** RFC 4648 base32 encoding without padding. */
function base32Encode(bytes: Uint8Array): string {
  let output = ''
  let buffer = 0
  let bufferedBits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bufferedBits += 8
    while (bufferedBits >= BITS_PER_BASE32_CHAR) {
      bufferedBits -= BITS_PER_BASE32_CHAR
      output += BASE32_ALPHABET[(buffer >>> bufferedBits) & 31]
    }
    buffer &= (1 << bufferedBits) - 1
  }
  if (bufferedBits > 0) {
    output += BASE32_ALPHABET[(buffer << (BITS_PER_BASE32_CHAR - bufferedBits)) & 31]
  }
  return output
}

/** Strict RFC 4648 base32 decoding: only `[A-Z2-7]`, no padding, no lower case. */
function base32Decode(encoded: string): Uint8Array {
  const bytes: number[] = []
  let buffer = 0
  let bufferedBits = 0
  for (const char of encoded) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value < 0) throw new Error('Invalid base32 secret')
    buffer = (buffer << BITS_PER_BASE32_CHAR) | value
    bufferedBits += BITS_PER_BASE32_CHAR
    if (bufferedBits >= 8) {
      bufferedBits -= 8
      bytes.push((buffer >>> bufferedBits) & 0xff)
      buffer &= (1 << bufferedBits) - 1
    }
  }
  return new Uint8Array(bytes)
}

function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base32Decode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
}

/** RFC 4226 HOTP value for one counter, zero-padded to TOTP_DIGITS. */
async function hotp(key: CryptoKey, step: number): Promise<string> {
  const counter = new DataView(new ArrayBuffer(8))
  counter.setUint32(0, Math.floor(step / TWO_POW_32))
  counter.setUint32(4, step >>> 0)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer))
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = mac[mac.length - 1] & 0x0f
  const truncated = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff
  return String(truncated % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/** HOTP value for one step, zero-padded to TOTP_DIGITS. Exported for RFC test vectors. */
export async function generateTotpCode(secret: string, step: number): Promise<string> {
  return hotp(await importHmacKey(secret), step)
}

/** floor(unixSeconds / TOTP_PERIOD_SECONDS). */
export function totpStepAt(unixSeconds: number): number {
  return Math.floor(unixSeconds / TOTP_PERIOD_SECONDS)
}

/** Edge-native {@link ITotpProvider}: HMAC-SHA1, 6 digits, 30 s (RFC 6238). */
export class WebCryptoTotpProvider implements ITotpProvider {
  generateSecret(): string {
    return base32Encode(crypto.getRandomValues(new Uint8Array(TOTP_SECRET_BYTES)))
  }

  async verify(secret: string, code: string, unixSeconds: number): Promise<number | null> {
    if (!CODE_PATTERN.test(code)) return null
    const key = await importHmacKey(secret)
    const currentStep = totpStepAt(unixSeconds)
    let matchedStep: number | null = null
    // Every candidate is compared, with no early exit, so timing does not reveal which step matched.
    for (let step = currentStep - TOTP_DRIFT_STEPS; step <= currentStep + TOTP_DRIFT_STEPS; step++) {
      const candidate = await hotp(key, step)
      if (timingSafeEqual(candidate, code)) matchedStep = step
    }
    return matchedStep
  }

  buildUri({ issuer, accountName, secret }: TotpUriInput): string {
    const encodedIssuer = encodeURIComponent(issuer)
    return `otpauth://totp/${encodedIssuer}:${encodeURIComponent(accountName)}`
      + `?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`
  }
}
