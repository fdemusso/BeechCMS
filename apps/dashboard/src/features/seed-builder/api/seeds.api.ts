// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from "hono/client"
import { rpc } from "@/lib/rpc"
import type { Seed, Branch, BranchType } from "@beechcms/core"

/**
 * One row of `GET /api/seeds`, inferred from the route. The definition stays the shared `Seed`:
 * the serialized form widens `layout?: unknown` to `JSONValue`, which makes every `Seed` fixture
 * and every `Seed` consumer a mismatch without saying anything the type did not already say.
 */
export type SeedRecordDTO = Omit<InferResponseType<typeof rpc.api.seeds.$get>[number], "definition"> & {
  definition: Seed
}

export const seedsApi = {
  list: async (): Promise<SeedRecordDTO[]> => {
    const response = await rpc.api.seeds.$get()
    return response.json()
  },
  get: async (slug: string) => {
    const response = await rpc.api.seeds[":slug"].$get({ param: { slug } })
    return response.json()
  },
  create: async (seed: Seed) => {
    const response = await rpc.api.seeds.$post({ json: seed })
    return response.json()
  },
  update: async (slug: string, seed: Seed) => {
    const response = await rpc.api.seeds[":slug"].$put({ param: { slug }, json: seed })
    return response.json()
  },
  addBranch: async (slug: string, branch: Omit<Branch, "id">) => {
    const response = await rpc.api.seeds[":slug"].branches.$post({ param: { slug }, json: branch })
    return response.json()
  },
  remove: async (slug: string) => {
    const response = await rpc.api.seeds[":slug"].$delete({ param: { slug } })
    return response.json()
  },

  // --- Sprint 06: Danger Zone ---
  hardDelete: async (slug: string, confirm: string) => {
    const response = await rpc.api.seeds[":slug"].hard.$delete({ param: { slug }, json: { confirm } })
    return response.json()
  },
  dropBranch: async (slug: string, branchId: string, confirm: string) => {
    const response = await rpc.api.seeds[":slug"].branches[":branchId"].$delete({ param: { slug, branchId }, json: { confirm } })
    return response.json()
  },
  dropOrphan: async (slug: string, column: string, confirm: string) => {
    const response = await rpc.api.seeds[":slug"].orphans[":column"].$delete({ param: { slug, column }, json: { confirm } })
    return response.json()
  },
  renameBranch: async (slug: string, branchId: string, newAlias: string, confirm: string) => {
    const response = await rpc.api.seeds[":slug"].branches[":branchId"].rename.$patch({ param: { slug, branchId }, json: { newAlias, confirm } })
    return response.json()
  },
  retypeBranch: async (slug: string, branchId: string, newType: BranchType, confirm: string) => {
    const response = await rpc.api.seeds[":slug"].branches[":branchId"].retype.$patch({ param: { slug, branchId }, json: { newType, confirm } })
    return response.json()
  },
  rebuildFts: async (slug: string) => {
    const response = await rpc.api.seeds[":slug"].fts.rebuild.$post({ param: { slug } })
    return response.json()
  },
  getOrphans: async (slug: string) => {
    const response = await rpc.api.seeds[":slug"].orphans.$get({ param: { slug } })
    return response.json()
  },
}
