// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IScheduler } from '@beechcms/core'

/** The only slice of Cloudflare's `ExecutionContext` this scheduler needs. */
interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void
}

export class ExecutionContextScheduler implements IScheduler {
  constructor(private readonly ctx: WaitUntilContext) {}

  waitUntil(promise: Promise<unknown>): void {
    this.ctx.waitUntil(promise)
  }
}
