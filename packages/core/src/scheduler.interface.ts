// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface IScheduler {
  waitUntil(promise: Promise<unknown>): void
}
