// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import i18n from "i18next"
import { ActivitySentence } from "../../components/activity-sentence"

afterEach(() => i18n.changeLanguage("en"))

describe("ActivitySentence", () => {
  it("puts the target in the middle of the sentence when the verb needs it (trash)", () => {
    const { container } = render(<ActivitySentence action="trash" user="Ada" target="Hello" userClassName="u" targetClassName="t" />)
    expect(container.textContent).toBe("Ada moved Hello to the Trash")
    expect(screen.getByText("Ada")).toHaveClass("u")
    expect(screen.getByText("Hello")).toHaveClass("t")
  })

  it("follows the active language", async () => {
    await i18n.changeLanguage("it")
    const { container } = render(<ActivitySentence action="discard_draft" user="Ada" target="Ciao" />)
    expect(container.textContent).toBe("Ada ha scartato una bozza di Ciao")
  })

  it("falls back to a generic sentence for an action with no translation", () => {
    const { container } = render(<ActivitySentence action="teleport" user="Ada" target="Hello" />)
    expect(container.textContent).toBe("Ada teleport Hello")
  })

  it("never lets free text open a tag or inject markup", () => {
    const { container } = render(<ActivitySentence action="create" user="<target>x</target>" target="<b>bold</b>" />)
    expect(container.textContent).toBe("<target>x</target> created <b>bold</b>")
    expect(container.querySelector("b")).toBeNull()
  })
})
