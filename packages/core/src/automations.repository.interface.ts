// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Automation, AutomationAction, AutomationTrigger, AutomationTriggerEvent, WhenNode } from './automations.types.js'

export interface CreateAutomationInput {
  seed_slug: string
  name: string
  triggers: AutomationTrigger[]
  trigger_conditions: WhenNode | null
  actions: AutomationAction[]
}

export type UpdateAutomationInput = Partial<CreateAutomationInput>

export interface IAutomationRepository {
  list(seedSlug: string): Promise<Automation[]>
  findById(id: string): Promise<Automation | null>
  create(input: CreateAutomationInput): Promise<string>
  update(id: string, input: UpdateAutomationInput): Promise<void>
  toggle(id: string, enabled: boolean): Promise<void>
  delete(id: string): Promise<void>
  findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]>
}
