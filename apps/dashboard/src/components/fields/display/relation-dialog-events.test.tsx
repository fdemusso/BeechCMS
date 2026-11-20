// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createPortal } from "react-dom"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { FieldsProvider, type FieldsContextType } from "../context"
import { RelationDisplay } from "./relation"

function FakeEntryEditorDialog() {
  return createPortal(<button type="button">Inside dialog</button>, document.body)
}

const fieldsConfig = {
  useSchema: () => ({ data: [{ slug: "authors", displayNameAlias: "name", branches: [] }] }),
  useLocaleConfig: () => undefined,
  fetchById: async (_slug: string, id: string) => ({ id, data: { name: "Ada" } }),
  queryKeys: { detail: (slug: string, id: string) => ["detail", slug, id] },
  components: { EntryEditorDialog: FakeEntryEditorDialog },
} as unknown as FieldsContextType

describe("RelationDisplay preview dialog", () => {
  it("a click inside the preview dialog does not reach the host row", async () => {
    const user = userEvent.setup()
    const onHostClick = vi.fn()
    const branch = { alias: "author", type: "relation", targetSeed: "authors", multiple: false }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FieldsProvider value={fieldsConfig}>
          <div onClick={onHostClick}>
            <RelationDisplay branch={branch as never} value="a1" />
          </div>
        </FieldsProvider>
      </QueryClientProvider>
    )
    await user.click(await screen.findByRole("button", { name: "Ada" }))
    onHostClick.mockClear()

    await user.click(screen.getByRole("button", { name: "Inside dialog" }))

    expect(onHostClick).not.toHaveBeenCalled()
  })
})
