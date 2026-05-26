// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IAutomationRunner, AutomationEventPayload } from './automations.runner.interface.js'

export class NoOpAutomationRunner implements IAutomationRunner {
  async run(_payload: AutomationEventPayload): Promise<void> {
    // intentionally empty
  }
}
