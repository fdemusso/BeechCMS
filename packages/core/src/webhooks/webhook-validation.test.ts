// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { isPrivateHost } from './webhook-validation.js'

// The WHATWG parser rewrites IPv6 literals (brackets kept, IPv4-mapped tail turned into hex),
// so production callers never see the form the author typed. Feed the parser's output.
const hostnameOf = (url: string): string => new URL(url).hostname

describe('isPrivateHost', () => {
  it.each([
    ['localhost', 'https://localhost/hook'],
    ['localhost with trailing dot', 'https://localhost./hook'],
    ['localhost subdomain', 'https://metadata.localhost/hook'],
    ['IPv4 loopback', 'https://127.0.0.1/hook'],
    ['IPv4 loopback alternate notation', 'https://0x7f.1/hook'],
    ['IPv4 unspecified', 'https://0.0.0.0/hook'],
    ['IPv4 10/8', 'https://10.0.0.5/hook'],
    ['IPv4 172.16/12', 'https://172.16.0.1/hook'],
    ['IPv4 192.168/16', 'https://192.168.1.1/hook'],
    ['IPv4 link-local metadata', 'https://169.254.169.254/hook'],
    ['IPv4 carrier-grade NAT', 'https://100.64.0.1/hook'],
    ['IPv6 loopback', 'https://[::1]/hook'],
    ['IPv6 unspecified', 'https://[::]/hook'],
    ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/hook'],
    ['IPv4-mapped IPv6 metadata address', 'https://[::ffff:169.254.169.254]/hook'],
    ['IPv4-mapped IPv6 10/8', 'https://[::ffff:10.0.0.1]/hook'],
    ['IPv4-mapped IPv6 spelled in hex', 'https://[::ffff:a9fe:a9fe]/hook'],
    ['IPv4-compatible IPv6 loopback', 'https://[::127.0.0.1]/hook'],
    ['NAT64 loopback', 'https://[64:ff9b::7f00:1]/hook'],
    ['NAT64 metadata address', 'https://[64:ff9b::169.254.169.254]/hook'],
    ['6to4 loopback', 'https://[2002:7f00:1::]/hook'],
    ['IPv6 unique local fc00::/7 (fc prefix)', 'https://[fc00::1]/hook'],
    ['IPv6 unique local fc00::/7 (fd prefix)', 'https://[fd12:3456::1]/hook'],
    ['IPv6 link-local fe80::/10 (fe80)', 'https://[fe80::1]/hook'],
    ['IPv6 link-local fe80::/10 (febf)', 'https://[febf::1]/hook'],
  ])('blocks %s', (_label, url) => {
    expect(isPrivateHost(hostnameOf(url))).toBe(true)
  })

  it.each([
    ['public DNS name', 'https://example.com/hook'],
    ['IPv4 just above 172.16/12', 'https://172.32.0.1/hook'],
    ['public IPv4', 'https://93.184.216.34/hook'],
    ['public IPv6', 'https://[2606:2800:220:1:248:1893:25c8:1946]/hook'],
    ['IPv4-mapped IPv6 of a public address', 'https://[::ffff:93.184.216.34]/hook'],
    ['NAT64 of a public address', 'https://[64:ff9b::5db8:d822]/hook'],
    ['DNS name that merely starts with a private prefix', 'https://10.example.com/hook'],
    ['DNS name that merely contains localhost', 'https://localhost.example.com/hook'],
  ])('allows %s', (_label, url) => {
    expect(isPrivateHost(hostnameOf(url))).toBe(false)
  })
})
