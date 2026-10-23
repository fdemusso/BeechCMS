// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

// ChartStyle writes config values into a raw <style> via dangerouslySetInnerHTML, and widget
// layouts store `color` as free text, so the sink itself must reject anything that is not a colour.
function renderStyleText(config: ChartConfig): string {
  const { container } = render(
    <ChartContainer config={config}>
      <div />
    </ChartContainer>
  )

  return container.querySelector("style")?.textContent ?? ""
}

describe("ChartStyle", () => {
  it.each(["#3b82f6", "rebeccapurple", "var(--chart-1)", "oklch(0.7 0.15 200 / 50%)", "rgb(10, 20, 30)"])(
    "emits the colour %s as a custom property",
    (color) => {
      const css = renderStyleText({ value: { color } })

      expect(css).toContain(`--color-value: ${color};`)
    }
  )

  it("drops a colour that closes the rule and injects a new one", () => {
    const css = renderStyleText({ value: { color: "red; } body { display: none" } })

    expect(css).not.toContain("body")
    expect(css).not.toContain("--color-value")
  })

  it("drops a colour that smuggles in a url() fetch", () => {
    const css = renderStyleText({ value: { color: "url(https://attacker.example/x)" } })

    expect(css).not.toContain("attacker.example")
  })

  it("drops a config key that is not a plain identifier", () => {
    const css = renderStyleText({
      "x: red; } body { display: none; } .y": { color: "#fff" },
      safe: { color: "#000" },
    })

    expect(css).not.toContain("body")
    expect(css).toContain("--color-safe: #000;")
  })
})
