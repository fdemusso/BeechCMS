// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Seed } from "@beechcms/core"
import { toast } from "sonner"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/seed-builder/api/seeds.api", () => ({ seedsApi: { remove: vi.fn() } }))

import { seedsApi } from "@/features/seed-builder/api/seeds.api"
import { ApiError, type ApiErrorBody } from "@/lib/http/api-error"
import type { SeedRecordDTO } from "@/features/seed-builder/api/seeds.api"
import { DeleteSeedDialog } from "@/features/seed-builder/components/DeleteSeedDialog"

const record: SeedRecordDTO = {
  slug: "article",
  definition: { slug: "article", label: "Article", labelPlural: "Articles", displayNameAlias: "title", branches: [] } as Seed,
  status: "active",
  source: "runtime",
  createdAt: 1,
  updatedAt: 1,
}

// Unlike delete-seed-dialog.test.tsx this suite keeps the real useDeleteSeed, because the defect lives
// in the interplay between the hook's own onError toast and the dialog's per-call onError toast.
describe("DeleteSeedDialog — reference conflict", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows a single error toast when the API answers 409 with the referencing seeds", async () => {
    vi.mocked(seedsApi.remove).mockRejectedValue(
      new ApiError(409, { detail: "Seed is referenced", referencedBy: ["author"] } as ApiErrorBody),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DeleteSeedDialog seed={record} open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByText(/^Delete$/i))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})
