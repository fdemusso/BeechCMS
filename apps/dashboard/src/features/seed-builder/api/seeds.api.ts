// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "../../../lib/api"
import type { Seed, Branch } from "@beechcms/core"

export interface SeedRecordDTO {
  slug: string
  definition: Seed
  status: "active" | "deleted"
  source: "code" | "runtime"
  createdAt: number
  updatedAt: number
}

export const seedsApi = {
  list: async () => (await api.get<SeedRecordDTO[]>("/seeds")).data,
  get: async (slug: string) => (await api.get<SeedRecordDTO>(`/seeds/${slug}`)).data,
  create: async (seed: Seed) => (await api.post<{ slug: string }>("/seeds", seed)).data,
  update: async (slug: string, seed: Seed) => (await api.put(`/seeds/${slug}`, seed)).data,
  addBranch: async (slug: string, branch: Omit<Branch, "id">) =>
    (await api.post<{ id: string }>(`/seeds/${slug}/branches`, branch)).data,
  remove: async (slug: string) => (await api.delete(`/seeds/${slug}`)).data,

  // --- Sprint 06: Danger Zone ---
  hardDelete: async (slug: string, confirm: string) =>
    (await api.delete<{ success: boolean }>(`/seeds/${slug}/hard`, { data: { confirm } })).data,
  dropBranch: async (slug: string, branchId: string, confirm: string) =>
    (await api.delete<{ success: boolean }>(`/seeds/${slug}/branches/${branchId}`, { data: { confirm } })).data,
  renameBranch: async (slug: string, branchId: string, newAlias: string, confirm: string) =>
    (await api.patch<{ success: boolean; affectedAutomations: string[] }>(`/seeds/${slug}/branches/${branchId}/rename`, { newAlias, confirm })).data,
  retypeBranch: async (slug: string, branchId: string, newType: string, confirm: string) =>
    (await api.patch<{ success: boolean }>(`/seeds/${slug}/branches/${branchId}/retype`, { newType, confirm })).data,
  rebuildFts: async (slug: string) =>
    (await api.post<{ success: boolean }>(`/seeds/${slug}/fts/rebuild`)).data,
  getOrphans: async (slug: string) =>
    (await api.get<{ orphans: string[] }>(`/seeds/${slug}/orphans`)).data,
}
