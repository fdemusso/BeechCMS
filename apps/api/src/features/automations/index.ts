// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { AutomationRunner } from './automation-runner'
export type { AutomationRunnerDeps } from './automation-runner'
export { runCronAutomations } from './cron-runner'
export type { CronRunnerDeps } from './cron-runner'
export { automationsApp } from './automations.handler'
export {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
  automationActionSchema,
} from './automations.schema'
export type { CreateAutomationBody, UpdateAutomationBody } from './automations.schema'
