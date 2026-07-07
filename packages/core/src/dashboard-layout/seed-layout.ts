// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed, Branch } from '../engine/types.js'
import { findBranchById } from '../engine/seed-registry.js'

// ---------------------------------------------------------------------------
// View config — per-seed, per-view dashboard preferences (KB-S02)
// ---------------------------------------------------------------------------

export const kanbanViewConfigSchema = z.object({
  axisBranchId: z.string().nullable(),
  sort: z.object({ branchId: z.string(), dir: z.enum(['ASC', 'DESC']) }).nullable(),
  hiddenColumnValues: z.array(z.string()).optional(),
  collapsedColumnValues: z.array(z.string()).optional(),
})
export type KanbanViewConfig = z.infer<typeof kanbanViewConfigSchema>

// ---------------------------------------------------------------------------
// Kanban card layout (view_config.card)
// ---------------------------------------------------------------------------

export const cardSlotFieldSchema = z.object({
  branchId: z.string().regex(/^br_[A-Za-z0-9]+$/),
})
export type CardSlotField = z.infer<typeof cardSlotFieldSchema>

export const kanbanCardConfigSchema = z.object({
  version: z.literal(1),
  /** Optional media/avatar slot. Full width. Max 1. */
  media: cardSlotFieldSchema.nullable().optional(),
  /** Full-width primary line. Max 1. */
  header: cardSlotFieldSchema.nullable().optional(),
  /** Full-width secondary line. Max 1. */
  subtitle: cardSlotFieldSchema.nullable().optional(),
  /** 2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP). */
  metadata: z.array(cardSlotFieldSchema).max(6).default([]),
})
export type KanbanCardConfig = z.infer<typeof kanbanCardConfigSchema>

export const seedViewConfigSchema = z.object({
  kanban: kanbanViewConfigSchema.optional(),
  card: kanbanCardConfigSchema.optional(),
}).passthrough()
export type SeedViewConfig = z.infer<typeof seedViewConfigSchema>

// ---------------------------------------------------------------------------
// Layout interfaces
// ---------------------------------------------------------------------------

/** Reference to a Seed branch by its stable id (e.g. 'br_03').
 *  Aliases can be renamed — ids cannot. When the id does not match any
 *  branch on the Seed at read time, the field is silently stripped (auto-cleanup). */
export interface LayoutField {
  branchId: string
}

export interface LayoutColumn {
  id: string
  fields: LayoutField[]
}

export interface LayoutSection {
  id: string
  label?: string
  hideLabel?: boolean
  hideBorder?: boolean
  collapsible?: boolean
  /** Max 4 columns. Enforced by validator. */
  columns: LayoutColumn[]
}

export interface LayoutTab {
  id: string
  label: string
  sections: LayoutSection[]
}

export interface FormLayout {
  /** Format version — bump when introducing breaking changes. */
  version: 1
  tabs: LayoutTab[]
}

// ---------------------------------------------------------------------------
// Branch-type rules used by both the default generator and the validator.
// ---------------------------------------------------------------------------

/** Branch types that must occupy a section alone, full width. */
export const FULL_WIDTH_BRANCH_TYPES = new Set<Branch['type']>(['richtext'])

/** Returns true when a branch is a gallery (file + multiple/asset-list). */
export function isGalleryBranch(branch: Branch): boolean {
  return branch.type === 'file'
    && (branch.multiple === true || branch.format === 'asset-list')
}

/** Branch types currently unsupported in the Layout Builder. */
export const UNSUPPORTED_BRANCH_TYPES = new Set<Branch['type']>(['json'])

/** Aliases that are NEVER included in the editor form (handled by other UI). */
export const SYSTEM_ALIASES = new Set<string>([
  'id', 'slug', 'status', 'created_at', 'updated_at',
])

/** True when the branch is eligible to appear in the layout at all. */
export function isLayoutableBranch(branch: Branch): boolean {
  if (SYSTEM_ALIASES.has(branch.alias)) return false
  if (branch.policies?.visibility === 'hidden') return false
  if (UNSUPPORTED_BRANCH_TYPES.has(branch.type)) return false
  return true
}

/** True when the branch must occupy a dedicated full-width section. */
export function isFullWidthBranch(branch: Branch): boolean {
  return FULL_WIDTH_BRANCH_TYPES.has(branch.type) || isGalleryBranch(branch)
}

/** Branches considered SEO fields. Matches the existing rule in entry-editor.tsx. */
export function isSeoBranch(branch: Branch): boolean {
  return branch.alias.startsWith('meta')
}

// ---------------------------------------------------------------------------
// Kanban card eligibility + pure validator
// ---------------------------------------------------------------------------

export const METADATA_SLOT_CAP = 6

const CARD_FORBIDDEN_TYPES = new Set<Branch['type']>(['richtext', 'json', 'repeater'])

export function isCardEligibleBranch(branch: Branch): boolean {
  if (SYSTEM_ALIASES.has(branch.alias)) return false
  if (branch.policies?.visibility === 'hidden') return false
  if (CARD_FORBIDDEN_TYPES.has(branch.type)) return false
  return true
}

export type ValidateCardConfigResult =
  | { ok: true; cleaned: KanbanCardConfig }
  | { ok: false; errors: string[]; cleaned: KanbanCardConfig }

export function validateCardConfigAgainstSeed(
  config: KanbanCardConfig,
  seed: Seed,
): ValidateCardConfigResult {
  const errors: string[] = []
  const seen = new Set<string>()

  const keepSingle = (f: CardSlotField | null | undefined): CardSlotField | null => {
    if (!f) return null
    const b = findBranchById(seed, f.branchId)
    if (!b || !isCardEligibleBranch(b)) return null
    if (seen.has(f.branchId)) { errors.push(`Branch ${f.branchId} placed more than once.`); return null }
    seen.add(f.branchId)
    return { branchId: f.branchId }
  }

  const media    = keepSingle(config.media)
  const header   = keepSingle(config.header)
  const subtitle = keepSingle(config.subtitle)

  const metadata: CardSlotField[] = []
  for (const f of config.metadata ?? []) {
    const b = findBranchById(seed, f.branchId)
    if (!b || !isCardEligibleBranch(b)) continue
    if (seen.has(f.branchId)) { errors.push(`Branch ${f.branchId} placed more than once.`); continue }
    seen.add(f.branchId)
    if (metadata.length >= METADATA_SLOT_CAP) { errors.push(`Metadata slot exceeds cap ${METADATA_SLOT_CAP}.`); continue }
    metadata.push({ branchId: f.branchId })
  }

  const cleaned: KanbanCardConfig = { version: 1, media, header, subtitle, metadata }
  return errors.length ? { ok: false, errors, cleaned } : { ok: true, cleaned }
}

// ---------------------------------------------------------------------------
// Zod schema for shape validation
// ---------------------------------------------------------------------------

export const layoutFieldSchema = z.object({ branchId: z.string().regex(/^br_[A-Za-z0-9]+$/) })
export const layoutColumnSchema = z.object({
  id: z.string().min(1),
  fields: z.array(layoutFieldSchema),
})
export const layoutSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  hideLabel: z.boolean().optional(),
  hideBorder: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  columns: z.array(layoutColumnSchema).min(1).max(4),
})
export const layoutTabSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  sections: z.array(layoutSectionSchema).min(1),
})
export const formLayoutSchema = z.object({
  version: z.literal(1),
  tabs: z.array(layoutTabSchema).min(1).max(8),
})

// ---------------------------------------------------------------------------
// Default layout generator
// ---------------------------------------------------------------------------

const DEFAULT_COLUMNS_PER_SECTION = 3

const defaultIdFactory = (): string => crypto.randomUUID()

function buildSectionsForBranches(
  branches: Branch[],
  newId: () => string,
): LayoutSection[] {
  const sections: LayoutSection[] = []
  let currentColumns: LayoutColumn[] = []

  function flushCompact(): void {
    if (currentColumns.length === 0) return
    sections.push({ id: newId(), columns: currentColumns })
    currentColumns = []
  }

  for (const branch of branches) {
    if (isFullWidthBranch(branch)) {
      flushCompact()
      sections.push({
        id: newId(),
        label: branch.label,
        hideLabel: true,
        columns: [{ id: newId(), fields: [{ branchId: branch.id }] }],
      })
    } else {
      currentColumns.push({ id: newId(), fields: [{ branchId: branch.id }] })
      if (currentColumns.length >= DEFAULT_COLUMNS_PER_SECTION) {
        flushCompact()
      }
    }
  }

  flushCompact()

  if (sections.length === 0) {
    sections.push({ id: newId(), columns: [{ id: newId(), fields: [] }] })
  }

  return sections
}

export function generateDefaultLayout(
  seed: Seed,
  opts?: { newId: () => string },
): FormLayout {
  const newId = opts?.newId ?? defaultIdFactory
  const layoutable = seed.branches.filter(isLayoutableBranch)

  const seo = layoutable.filter(isSeoBranch)
  const main = layoutable.filter((b) => !isSeoBranch(b))

  const dataTab: LayoutTab = {
    id: newId(),
    label: 'Data',
    sections: buildSectionsForBranches(main, newId),
  }
  const seoTab: LayoutTab = {
    id: newId(),
    label: 'SEO',
    sections: buildSectionsForBranches(seo, newId),
  }

  return { version: 1, tabs: [dataTab, seoTab] }
}

// ---------------------------------------------------------------------------
// Semantic validator
// ---------------------------------------------------------------------------

export type ValidateLayoutResult =
  | { ok: true; cleaned: FormLayout }
  | { ok: false; errors: string[]; cleaned: FormLayout }

export function validateLayoutAgainstSeed(
  layout: FormLayout,
  seed: Seed,
): ValidateLayoutResult {
  // Gracefully handle undefined/null layout, or missing tabs (e.g. from {} placeholder)
  if (!layout || !Array.isArray(layout.tabs)) {
    const defaultLayout = generateDefaultLayout(seed)
    return {
      ok: false,
      errors: ['Invalid layout structure: missing tabs'],
      cleaned: defaultLayout,
    }
  }

  const errors: string[] = []
  const seenBranchIds = new Set<string>()

  const cleanedTabs: LayoutTab[] = (layout.tabs ?? []).map((tab) => ({
    ...tab,
    sections: (tab?.sections ?? []).map((section) => ({
      ...section,
      columns: (section?.columns ?? []).map((col) => ({
        ...col,
        fields: (col?.fields ?? []).filter((f) => {
          if (!f || typeof f !== 'object' || !('branchId' in f)) return false
          const branch = findBranchById(seed, f.branchId)
          if (!branch) return false
          if (UNSUPPORTED_BRANCH_TYPES.has(branch.type) || SYSTEM_ALIASES.has(branch.alias)) return false
          return true
        }),
      })),
    })),
  }))

  // Duplicate and full-width constraint checks on cleaned layout
  for (const tab of cleanedTabs) {
    for (const section of tab.sections ?? []) {
      const fieldsInSection: Branch[] = []

      for (const col of section.columns ?? []) {
        for (const f of col.fields ?? []) {
          const branch = findBranchById(seed, f.branchId)
          if (!branch) continue

          if (seenBranchIds.has(f.branchId)) {
            errors.push(`Branch '${branch.alias}' (id=${f.branchId}) appears more than once in the layout.`)
          } else {
            seenBranchIds.add(f.branchId)
            fieldsInSection.push(branch)
          }
        }
      }

      // Full-width branches must occupy a dedicated section
      const fullWidthInSection = fieldsInSection.filter(isFullWidthBranch)
      if (fullWidthInSection.length > 0 && fieldsInSection.length > fullWidthInSection.length) {
        for (const fw of fullWidthInSection) {
          errors.push(
            `Branch '${fw.alias}' (type=${fw.type}) must occupy a dedicated section and cannot share it with other fields.`,
          )
        }
      }
    }
  }

  const cleaned: FormLayout = { ...layout, tabs: cleanedTabs }
  if (errors.length > 0) return { ok: false, errors, cleaned }
  return { ok: true, cleaned }
}

