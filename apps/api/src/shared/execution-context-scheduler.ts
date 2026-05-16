import type { IScheduler } from '@beechcms/core'

export class ExecutionContextScheduler implements IScheduler {
  constructor(private readonly ctx: ExecutionContext) {}

  waitUntil(promise: Promise<unknown>): void {
    this.ctx.waitUntil(promise)
  }
}
