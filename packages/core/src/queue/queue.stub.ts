// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IQueueService } from './queue.interface.js'

/** Drops messages without a transport. */
export class NoOpQueueService implements IQueueService {
  async enqueue<T>(_name: string, _payload: T): Promise<boolean> {
    return false
  }
}
