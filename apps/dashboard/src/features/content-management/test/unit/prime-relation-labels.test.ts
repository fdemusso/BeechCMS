// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import type { Seed } from "@beechcms/core"
import { primeRelationLabels } from "../../lib/prime-relation-labels"
import { CONTENT_QUERY_KEYS } from "../../consts/content.keys"

// Only the fields the function reads; a real seed carries many more.
const seeds = [
  { slug: "abbonamenti", branches: [{ alias: "cliente", type: "relation", targetSeed: "clienti" }] },
  { slug: "clienti", displayNameAlias: "ragione_sociale", branches: [] },
] as unknown as Seed[]

describe("primeRelationLabels", () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient()
  })

  it("stores a label stub in the target's detail cache for every related id", () => {
    primeRelationLabels(client, seeds, "abbonamenti", { relations: { cliente: { c1: "Acme", c2: "Globex" } }, relationAvatars: {} })

    expect(client.getQueryData(CONTENT_QUERY_KEYS.detail("clienti", "c1"))).toMatchObject({
      id: "c1",
      data: { ragione_sociale: "Acme" },
      updated_at: null,
    })
    expect(client.getQueryData(CONTENT_QUERY_KEYS.detail("clienti", "c2"))).toMatchObject({ data: { ragione_sociale: "Globex" } })
  })

  it("never overwrites a detail entry that is already cached", () => {
    const real = { id: "c1", data: { ragione_sociale: "Acme S.p.A." }, updated_at: "2026-01-01" }
    client.setQueryData(CONTENT_QUERY_KEYS.detail("clienti", "c1"), real)

    primeRelationLabels(client, seeds, "abbonamenti", { relations: { cliente: { c1: "Acme" } }, relationAvatars: {} })

    expect(client.getQueryData(CONTENT_QUERY_KEYS.detail("clienti", "c1"))).toBe(real)
  })

  it("does nothing for a response without relations", () => {
    primeRelationLabels(client, seeds, "abbonamenti", { relations: {}, relationAvatars: {} })

    expect(client.getQueryCache().getAll()).toEqual([])
  })

  it("skips a relation alias the seed does not declare", () => {
    primeRelationLabels(client, seeds, "abbonamenti", { relations: { unknown: { x1: "Nope" } }, relationAvatars: {} })

    expect(client.getQueryCache().getAll()).toEqual([])
  })
})
