// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  IAutomationRepository,
  Automation,
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationTriggerEvent,
} from '@beechcms/core'

export class StaticAutomationRepository implements IAutomationRepository {
  private automations: Automation[] = []

  async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
    return this.automations.filter(
      (a) => a.enabled && 
             (a.seed_slug === seedSlug || seedSlug === '*') && 
             a.triggers.some(t => t.event === event)
    )
  }

  async list(seedSlug: string): Promise<Automation[]> {
    return this.automations.filter((a) => a.seed_slug === seedSlug)
  }

  async findById(id: string): Promise<Automation | null> {
    return this.automations.find((a) => a.id === id) ?? null
  }

  async create(input: CreateAutomationInput): Promise<string> {
    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const automation: Automation = {
      id,
      seed_slug: input.seed_slug,
      name: input.name,
      enabled: true,
      triggers: input.triggers,
      trigger_conditions: input.trigger_conditions ?? null,
      actions: input.actions,
      created_at: now,
      updated_at: now,
    }
    this.automations.push(automation)
    return id
  }

  async update(id: string, input: UpdateAutomationInput): Promise<void> {
    const idx = this.automations.findIndex((a) => a.id === id)
    if (idx === -1) return
    const current = this.automations[idx]
    
    if (input.seed_slug !== undefined) current.seed_slug = input.seed_slug
    if (input.name !== undefined) current.name = input.name
    if (input.triggers !== undefined) current.triggers = input.triggers
    if (input.trigger_conditions !== undefined) current.trigger_conditions = input.trigger_conditions
    if (input.actions !== undefined) current.actions = input.actions
    
    current.updated_at = Math.floor(Date.now() / 1000)
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const automation = await this.findById(id)
    if (automation) {
      automation.enabled = enabled
      automation.updated_at = Math.floor(Date.now() / 1000)
    }
  }

  async delete(id: string): Promise<void> {
    this.automations = this.automations.filter((a) => a.id !== id)
  }
}
