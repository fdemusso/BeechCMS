// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { escapeHtml, buildEmailShell } from '../src/shared/email/templates/shell'
import { buildInvitationEmail } from '../src/shared/email/templates/invitation'

describe('email/templates/shell', () => {
  describe('escapeHtml', () => {
    it('escapes special HTML characters', () => {
      expect(escapeHtml('<script>alert("xss" & \'test\')</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;',
      )
    })

    it('returns empty string for falsy/empty values', () => {
      expect(escapeHtml('')).toBe('')
      expect(escapeHtml(null)).toBe('')
      expect(escapeHtml(undefined)).toBe('')
    })

    it('handles non-string primitives', () => {
      expect(escapeHtml(123)).toBe('123')
      expect(escapeHtml(0)).toBe('')
    })

    it('leaves safe strings unchanged', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123')
    })
  })

  describe('buildEmailShell', () => {
    it('escapes title, warning, footer, and cta attributes', () => {
      const html = buildEmailShell('en', {
        title: 'Title <script>alert(1)</script>',
        body: 'Safe <strong>bold</strong> body',
        cta: {
          label: 'Click & Go <img src=x>',
          href: 'https://example.com/test?a=1&b=2"evil',
        },
        warning: 'Warning <script>alert(2)</script>',
        footer: 'Footer &copy; <script>',
      })

      expect(html).not.toContain('<script>')
      expect(html).not.toContain('<img src=x>')
      expect(html).not.toContain('"evil')
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
      expect(html).toContain('Click &amp; Go &lt;img src=x&gt;')
      expect(html).toContain('https://example.com/test?a=1&amp;b=2&quot;evil')
      expect(html).toContain('Safe <strong>bold</strong> body')
    })
  })
})

describe('email/templates/invitation', () => {
  it('escapes malicious HTML in roleName to prevent phishing injection (issue #479)', () => {
    const maliciousRole = 'Admin</strong><a href="https://evil.example/login">Verify your account</a><strong>'
    const result = buildInvitationEmail(
      'https://cms.test/admin/accept-invite?token=abcdef1234567890',
      maliciousRole,
      'all content',
      'en',
    )

    // The raw phishing tag must not be injected into the HTML
    expect(result.html).not.toContain('<a href="https://evil.example/login">')
    expect(result.html).toContain('&lt;a href=&quot;https://evil.example/login&quot;&gt;Verify your account&lt;/a&gt;')
    expect(result.html).toContain('Admin&lt;/strong&gt;')
    // Safe structure tags must remain intact
    expect(result.html).toContain('as <strong>')
    expect(result.html).toContain('on <strong>all content</strong>')
  })

  it('escapes malicious HTML in roleName for Italian locale (issue #479)', () => {
    const maliciousRole = 'Admin</strong><a href="https://evil.example/login">Verify your account</a><strong>'
    const result = buildInvitationEmail(
      'https://cms.test/admin/accept-invite?token=abcdef1234567890',
      maliciousRole,
      'tutti i contenuti',
      'it',
    )

    expect(result.html).not.toContain('<a href="https://evil.example/login">')
    expect(result.html).toContain('&lt;a href=&quot;https://evil.example/login&quot;&gt;Verify your account&lt;/a&gt;')
    expect(result.html).toContain('come <strong>')
  })

  it('escapes malicious HTML in scopeLabel', () => {
    const result = buildInvitationEmail(
      'https://cms.test/admin/accept-invite?token=abcdef1234567890',
      'Editor',
      'posts<script>alert(1)</script>',
      'en',
    )

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('safely renders roles with special characters like ampersands', () => {
    const result = buildInvitationEmail(
      'https://cms.test/admin/accept-invite?token=abcdef1234567890',
      'Editor & Publisher',
      'posts & news',
      'en',
    )

    expect(result.html).toContain('<strong>Editor &amp; Publisher</strong>')
    expect(result.html).toContain('<strong>posts &amp; news</strong>')
  })
})
