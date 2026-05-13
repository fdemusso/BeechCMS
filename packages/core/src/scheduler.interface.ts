export interface IScheduler {
  waitUntil(promise: Promise<unknown>): void
}
