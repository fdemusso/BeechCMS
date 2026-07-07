// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IScheduler } from './scheduler.interface.js'

export class NoOpScheduler implements IScheduler {
  waitUntil(_promise: Promise<unknown>): void {
    // intentionally empty
  }
}
