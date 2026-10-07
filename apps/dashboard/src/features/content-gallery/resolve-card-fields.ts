// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { findBranchById, isCardEligibleBranch, isImageMediaBranch, type Branch, type KanbanCardConfig, type Seed } from "@beechcms/core"

export interface ResolvedCardFields {
  coverBranch: Branch | null
  titleBranch: Branch | null
  excerptBranch: Branch | null
  dateBranch: Branch | null
  tagsBranch: Branch | null
  categoryBranch: Branch | null
  /** Campi extra scelti dall'utente (solo con card personalizzata), mostrati sotto l'excerpt. */
  metadataBranches: Branch[]
}

function includesAnyToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token))
}

/**
 * Euristica di default, con un livello di personalizzazione sopra: senza `card` i campi sono
 * dedotti; con una `card` (stessa config del Kanban) gli slot sono quelli scelti, e uno slot
 * vuoto resta vuoto. Media → cover, header → titolo, subtitle → excerpt, metadata → campi
 * extra. Data e tag restano sempre dedotti.
 */
export function resolveCardFields(
  seed: Seed,
  groupByAlias: string | null = null,
  card?: KanbanCardConfig
): ResolvedCardFields {
  const branches = seed.branches
  const override = (slot: { branchId: string } | null | undefined): Branch | null =>
    slot ? findBranchById(seed, slot.branchId) : null

  // La categoria non è indovinata dal nome del campo: è lo stesso campo che
  // l'utente ha scelto nel "Raggruppa per" del toolbar (coerente con la tabella).
  const categoryBranch = groupByAlias
    ? branches.find((branch) => branch.alias === groupByAlias) ?? null
    : null

  const inferredCover =
    branches.find((branch) => {
      if (branch.type !== "file") return false
      const alias = branch.alias.trim().toLowerCase()
      return includesAnyToken(alias, ["cover", "image", "foto", "photo"])
    }) ?? null

  const inferredTitle =
    branches.find((branch) => {
      const alias = branch.alias.trim().toLowerCase()
      return alias === "title" || alias === "name"
    }) ?? null

  const titleBranch = card ? override(card.header) : inferredTitle
  const coverBranch = card ? override(card.media) : inferredCover

  const excerptBranch = card
    ? override(card.subtitle)
    : branches.find((branch) => {
        if (branch.type !== "richtext" && branch.type !== "text") return false
        if (branch.alias === categoryBranch?.alias) return false
        if (!titleBranch) return true
        return branch.alias !== titleBranch.alias
      }) ?? null

  const dateBranch = branches.find((branch) => branch.type === "date") ?? null

  const tagsBranch =
    branches.find((branch) => {
      if (branch.type !== "json") return false
      return branch.alias.toLowerCase().includes("tag")
    }) ?? null

  return {
    coverBranch,
    titleBranch,
    excerptBranch,
    dateBranch,
    tagsBranch,
    categoryBranch,
    metadataBranches: (card?.metadata ?? []).flatMap((slot) => override(slot) ?? []),
  }
}

/**
 * La card che l'euristica produce oggi, nella forma della config personalizzabile: è ciò che
 * il dialog mostra alla prima apertura. Un campo dedotto che il dialog non potrebbe offrire
 * (es. un file "cover" che non accetta immagini) viene lasciato fuori.
 */
export function defaultCardConfig(seed: Seed, groupByAlias: string | null = null): KanbanCardConfig {
  const fields = resolveCardFields(seed, groupByAlias)
  const slot = (branch: Branch | null, accepts: (b: Branch) => boolean) =>
    branch && accepts(branch) ? { branchId: branch.id } : undefined
  return {
    version: 1,
    media: slot(fields.coverBranch, isImageMediaBranch),
    header: slot(fields.titleBranch, isCardEligibleBranch),
    subtitle: slot(fields.excerptBranch, isCardEligibleBranch),
    metadata: [],
  }
}
