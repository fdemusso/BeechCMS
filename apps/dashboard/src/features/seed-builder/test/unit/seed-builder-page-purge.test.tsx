// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Seed } from "@beechcms/core"
import type { SeedRecordDTO } from "@/features/seed-builder"

const hardDelete = vi.fn().mockResolvedValue(undefined)

const deletedSeed: SeedRecordDTO = {
  slug: "article",
  definition: { slug: "article", label: "Article", labelPlural: "Articles", displayNameAlias: "title", branches: [] } as Seed,
  status: "deleted",
  source: "runtime",
  createdAt: 1,
  updatedAt: 1,
}

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" } }) }))
vi.mock("@/features/shared", () => ({ useSchema: () => ({ data: [] }) }))
vi.mock("@/features/entry-editor", () => ({ SchemaFormShell: () => null }))
vi.mock("@/features/seed-builder/hooks/use-seed-editor-dialog", () => ({ useSeedEditorDialog: () => ({}) }))
vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useSeeds: () => ({ data: [deletedSeed], isLoading: false, refetch: vi.fn() }),
  useDeleteSeed: () => ({ mutate: vi.fn(), isPending: false }),
  useHardDeleteSeed: () => ({ mutateAsync: hardDelete, isPending: false }),
  useDropBranch: () => ({}),
  useDropOrphan: () => ({}),
  useRenameBranch: () => ({}),
  useRetypeBranch: () => ({}),
  useRebuildFts: () => ({}),
  useOrphans: () => ({}),
}))

import { SeedBuilderPage } from "@/features/seed-builder/components/SeedBuilderPage"

describe("SeedBuilderPage — soft-deleted seeds", () => {
  it("lets an admin permanently purge a soft-deleted seed", async () => {
    render(<SeedBuilderPage />)
    fireEvent.click(screen.getByRole("switch"))

    await userEvent.click(screen.getByTestId("purge-seed-btn"))
    await userEvent.type(await screen.findByPlaceholderText("Type the slug to confirm"), "article")
    await userEvent.click(screen.getByRole("button", { name: "Delete permanently" }))

    await waitFor(() => expect(hardDelete).toHaveBeenCalledWith({ slug: "article", confirm: "article" }))
  })
})
