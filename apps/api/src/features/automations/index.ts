// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { AutomationRunner } from './engine/automation-runner'
export type { AutomationRunnerDeps } from './engine/automation-runner'
export { runCronAutomations } from './engine/cron-runner'
export type { CronRunnerDeps } from './engine/cron-runner'
export { automationsApp } from './api/automations.handler'
export {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
  automationActionSchema,
} from './api/automations.schema'
export type { CreateAutomationBody, UpdateAutomationBody } from './api/automations.schema'
