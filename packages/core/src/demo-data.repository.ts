// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface IDemoDataRepository {
  /** Executes the compiled demo dataset SQL against the database. */
  loadDemoData(): Promise<void>
}
