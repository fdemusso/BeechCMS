// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/email', () => ({ sendAutomationMail: vi.fn().mockResolvedValue(undefined) }))

import { sendAutomationMail } from '../../../shared/email'
import { executeSendMail } from './send-mail.executor'
import { resolveAutomationContext } from '../evaluator/context-resolver'

describe('executeSendMail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps recipient and subject plain-text while HTML-escaping only the body', async () => {
    const entry = { id: 'entry-1', email: "o'brien@x.com", name: '<b>O\'Brien</b> & Sons' }
    const context = await resolveAutomationContext({} as never, entry, [entry])

    await executeSendMail(
      {
        type: 'send_mail',
        to: '{{this.email}}',
        subject_template: 'Welcome {{this.name}}',
        body_template: '<p>{{this.name}}</p>',
      },
      context,
      { EMAIL_API_KEY: 'test-key' },
    )

    // Regression guard: `to` and subject went through the HTML escaper meant for the body,
    // so the recipient became "o&#39;brien@x.com" and the subject showed "&amp;" literally.
    expect(sendAutomationMail).toHaveBeenCalledTimes(1)
    expect(sendAutomationMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "o'brien@x.com",
        subject: "Welcome <b>O'Brien</b> & Sons",
        body: '<p>&lt;b&gt;O&#39;Brien&lt;/b&gt; &amp; Sons</p>',
      }),
    )
  })
})
