// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/

function parseIPv4(text: string): number[] | null {
  const match = IPV4_PATTERN.exec(text)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) ? octets : null
}

// Expands an IPv6 literal (no brackets) into its eight 16-bit groups, or null when malformed.
function parseIPv6(text: string): number[] | null {
  let literal = text
  const lastColon = literal.lastIndexOf(':')
  if (literal.includes('.')) {
    const v4 = parseIPv4(literal.slice(lastColon + 1))
    if (!v4) return null
    const high = ((v4[0] << 8) | v4[1]).toString(16)
    const low = ((v4[2] << 8) | v4[3]).toString(16)
    literal = `${literal.slice(0, lastColon + 1)}${high}:${low}`
  }

  const halves = literal.split('::')
  if (halves.length > 2) return null
  const split = (half: string): string[] => (half === '' ? [] : half.split(':'))
  const head = split(halves[0])
  const tail = halves.length === 2 ? split(halves[1]) : []

  const compressed = halves.length === 2
  if (compressed ? head.length + tail.length > 7 : head.length !== 8) return null

  const groups = compressed
    ? [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail]
    : head
  if (!groups.every((group) => HEXTET_PATTERN.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

function isPrivateIPv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

// Groups g6 and g7 carry the embedded IPv4 address of the mapped, NAT64 and 6to4 forms.
function embeddedIPv4(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff]
}

function isPrivateIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups
  const leadingZeros = (count: number): boolean => groups.slice(0, count).every((group) => group === 0)

  // ::/96 covers the unspecified address, loopback and the deprecated IPv4-compatible form.
  if (leadingZeros(6)) return true
  // ::ffff:0:0/96 (IPv4-mapped) is the same host as the IPv4 address it wraps.
  if (leadingZeros(5) && g5 === 0xffff) return isPrivateIPv4(embeddedIPv4(g6, g7))
  // 64:ff9b::/96 (NAT64) translates to the embedded IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateIPv4(embeddedIPv4(g6, g7))
  }
  // 2002::/16 (6to4) embeds the IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return isPrivateIPv4(embeddedIPv4(g1, g2))
  // fc00::/7 unique local, fe80::/10 link-local.
  return (g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80
}

/**
 * Whether a webhook target host is loopback, link-local, private or otherwise internal.
 * Expects `URL.hostname`, which the WHATWG parser already normalises: IPv6 literals stay bracketed
 * and IPv4-mapped tails are rewritten to hex, so the address is parsed, never string-matched.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true

  if (host.startsWith('[') && host.endsWith(']')) {
    const groups = parseIPv6(host.slice(1, -1))
    // An unparseable literal is rejected rather than trusted.
    return groups === null || isPrivateIPv6(groups)
  }

  const octets = parseIPv4(host)
  return octets !== null && isPrivateIPv4(octets)
}
