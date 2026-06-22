// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IQueueService } from './queue.interface.js'

/** Safe no-op producer (e.g. unit tests that don't assert on enqueue). */
export class NoOpQueueService implements IQueueService {
  async enqueue<T>(_name: string, _payload: T): Promise<void> {
    // intentionally empty
  }
}
