import type { IScheduler } from './scheduler.interface.js'

export class NoOpScheduler implements IScheduler {
  waitUntil(_promise: Promise<unknown>): void {
    // intentionally empty
  }
}
