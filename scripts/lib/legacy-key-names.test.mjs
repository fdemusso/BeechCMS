// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findLegacyKeyMentions } from './legacy-key-names.mjs'

const LEGACY_TOKENS = [
  'PUBLIC_READ_API_KEY',
  'PUBLIC_WRITE_API_KEY',
  'dev-read-key-changeme',
  'dev-public-write-key-changeme',
  'NEXT_PUBLIC_BEECH_READ_KEY',
  'VITE_BEECH_READ_KEY',
  'BEECH_WRITE_API_KEY',
  'beech_pub_',
]

const CLI_WORKFLOWS = 'docs/build/cli-workflows.md'
const MIGRATION_HEADING = '#### Moving a 0.10.x project to publishable and secret keys'

describe('findLegacyKeyMentions', () => {
  for (const token of LEGACY_TOKENS) {
    it(`reports ${token} once with its line and text`, () => {
      const content = `# Page\nSet ${token} now\nend`

      const mentions = findLegacyKeyMentions('docs/reference/page.md', content)

      assert.deepEqual(mentions, [{ line: 2, match: token }])
    })
  }

  it('reports apiKey on the line where it starts inside a multi-line client factory call', () => {
    const content = [
      '```ts',
      'const client = createBeechServerClient<AppRegistry>({',
      '  baseUrl: url,',
      '  apiKey: key,',
      '})',
      '```',
    ].join('\n')

    const mentions = findLegacyKeyMentions('docs/start/page.md', content)

    assert.deepEqual(mentions, [{ line: 4, match: 'apiKey' }])
  })

  it('ignores apiKey outside a client factory', () => {
    const content = [
      'const mail = createResendProvider({ apiKey: env.RESEND_API_KEY })',
      '<BeechForm apiKey="x" />',
    ].join('\n')

    const mentions = findLegacyKeyMentions('docs/features/page.md', content)

    assert.deepEqual(mentions, [])
  })

  it('accepts the publishable and secret key names', () => {
    const content = [
      'BEECH_PUBLISHABLE_KEY BEECH_SECRET_KEY',
      'beech_pk_dev beech_sk_dev',
      'publishableKey secretKey NEXT_PUBLIC_BEECH_PUBLISHABLE_KEY',
    ].join('\n')

    const mentions = findLegacyKeyMentions('docs/reference/page.md', content)

    assert.deepEqual(mentions, [])
  })

  it('allows the legacy name under the cli-workflows migration heading and reports it after the next heading', () => {
    const content = [
      MIGRATION_HEADING,
      'Rename PUBLIC_READ_API_KEY first.',
      '',
      '### 2. Database Migrations',
      'Never use PUBLIC_READ_API_KEY here.',
    ].join('\n')

    const mentions = findLegacyKeyMentions(CLI_WORKFLOWS, content)

    assert.deepEqual(mentions, [{ line: 5, match: 'PUBLIC_READ_API_KEY' }])
  })

  it('keeps the changelog section open across a comment line inside a fenced block', () => {
    const content = [
      '### Upgrading from 0.10.x',
      '```bash',
      '# rename PUBLIC_READ_API_KEY',
      'npx beech keys:migrate',
      '```',
      'Old name PUBLIC_WRITE_API_KEY stays allowed here.',
    ].join('\n')

    const mentions = findLegacyKeyMentions('CHANGELOG.md', content)

    assert.deepEqual(mentions, [])
  })

  it('allows nothing under the migration heading of another file', () => {
    const content = [MIGRATION_HEADING, 'Rename PUBLIC_READ_API_KEY first.'].join('\n')

    const mentions = findLegacyKeyMentions('docs/start/first-project.md', content)

    assert.deepEqual(mentions, [{ line: 2, match: 'PUBLIC_READ_API_KEY' }])
  })

  it('reports the same line numbers for CRLF content as for LF content', () => {
    const lines = ['# Page', '', 'a PUBLIC_READ_API_KEY', 'b dev-read-key-changeme']

    const lfMentions = findLegacyKeyMentions('docs/reference/page.md', lines.join('\n'))
    const crlfMentions = findLegacyKeyMentions('docs/reference/page.md', lines.join('\r\n'))

    assert.deepEqual(crlfMentions, lfMentions)
    assert.deepEqual(
      crlfMentions.map((mention) => mention.line),
      [3, 4],
    )
  })

  it('reports a bare apiKey in the docs site sources', () => {
    const content = ['<script setup></script>', 'with baseUrl and apiKey.'].join('\n')

    const mentions = findLegacyKeyMentions('docs/.vitepress/theme/components/LlmPromptNode.vue', content)

    assert.deepEqual(mentions, [{ line: 2, match: 'apiKey' }])
  })

  it('accepts the new key option names in the docs site sources', () => {
    const content = 'with baseUrl and publishableKey (browser) or secretKey (server).'

    const mentions = findLegacyKeyMentions('docs/.vitepress/theme/components/LlmPromptNode.vue', content)

    assert.deepEqual(mentions, [])
  })

  it('ignores a bare apiKey outside the docs site sources', () => {
    const content = ['# Email', 'apiKey: env.RESEND_API_KEY'].join('\n')

    const mentions = findLegacyKeyMentions('docs/features/email-module.md', content)

    assert.deepEqual(mentions, [])
  })
})
