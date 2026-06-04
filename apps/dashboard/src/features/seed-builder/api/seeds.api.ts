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
}
