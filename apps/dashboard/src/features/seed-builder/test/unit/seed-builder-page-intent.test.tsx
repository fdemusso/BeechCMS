// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import type { Seed } from "@beechcms/core"
import type { SeedRecordDTO } from "@/features/seed-builder"

const article: SeedRecordDTO = {
  slug: "article",
  definition: { slug: "article", label: "Article", labelPlural: "Articles", displayNameAlias: "title", branches: [] } as Seed,
  status: "active",
  source: "runtime",
  createdAt: 1,
  updatedAt: 1,
}

const dialogProps = vi.fn()

vi.mock("@/features/shared/hooks/use-permissions", () => ({ usePermissions: () => ({ canGlobally: () => true }) }))
vi.mock("@/features/shared", () => ({ useSchema: () => ({ data: [] }) }))
vi.mock("@/features/seed-builder/components/SeedFormDialog", () => ({
  SeedFormDialog: (props: { open: boolean; editRecord: SeedRecordDTO | null }) => {
    dialogProps(props.open, props.editRecord?.slug ?? null)
    return null
  },
}))
vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useSeeds: () => ({ data: [article], isLoading: false, refetch: vi.fn() }),
  useDeleteSeed: () => ({}),
  useHardDeleteSeed: () => ({}),
  useDropBranch: () => ({}),
  useDropOrphan: () => ({}),
  useRenameBranch: () => ({}),
  useRetypeBranch: () => ({}),
  useRebuildFts: () => ({}),
  useOrphans: () => ({}),
}))

import { SeedBuilderPage } from "@/features/seed-builder/components/SeedBuilderPage"

function Search() {
  return <span data-testid="search">{useLocation().search}</span>
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SeedBuilderPage />
      <Search />
    </MemoryRouter>,
  )
}

describe("SeedBuilderPage — ?seed intent from the command palette", () => {
  it("?seed=new opens the create dialog and is consumed", () => {
    dialogProps.mockClear()
    const { getByTestId } = renderAt("/?settings=content-types&seed=new")
    expect(dialogProps).toHaveBeenCalledWith(true, null)
    expect(getByTestId("search").textContent).toBe("?settings=content-types")
  })

  it("?seed=<slug> opens that content type for editing", () => {
    dialogProps.mockClear()
    renderAt("/?settings=content-types&seed=article")
    expect(dialogProps).toHaveBeenCalledWith(true, "article")
  })

  it("an unknown slug opens nothing and is dropped from the URL", () => {
    dialogProps.mockClear()
    const { getByTestId } = renderAt("/?settings=content-types&seed=ghost")
    expect(dialogProps).not.toHaveBeenCalledWith(true, expect.anything())
    expect(getByTestId("search").textContent).toBe("?settings=content-types")
  })
})
