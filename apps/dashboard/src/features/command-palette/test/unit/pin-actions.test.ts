// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import type { TFunction } from "i18next"
import { PALETTE_PIN_ID_MAX_LENGTH } from "@beechcms/core"
import { Pin, PinOff, Settings } from "@/components/icons"
import { PIN_ACTION_ID, UNPIN_ACTION_ID, withPinActions } from "../../lib/pin-actions"
import { toPinRowId } from "../../providers/pins-provider"
import { toRecentRowId } from "../../providers/recent-items-provider"
import type { PaletteItem, PaletteRowAction, ResolvedPaletteItem } from "../../types"
import type { PalettePinsState } from "../../use-palette-pins"

const t = ((key: string) => key) as unknown as TFunction

function row(id: string, overrides: Partial<ResolvedPaletteItem> = {}): ResolvedPaletteItem {
  return {
    id,
    section: "Source section",
    label: id,
    icon: Settings,
    perform: { kind: "navigate", to: "/" },
    disabledReason: null,
    ...overrides,
  }
}

function stableOf(...rows: PaletteItem[]): ReadonlyMap<string, PaletteItem> {
  return new Map(rows.map((item) => [item.id, item]))
}

function ready(...ids: string[]): PalettePinsState {
  return { status: "ready", ids, saving: false }
}

function decorate(items: ResolvedPaletteItem[], stable: ReadonlyMap<string, PaletteItem>, pins: PalettePinsState) {
  const pin = vi.fn()
  const unpin = vi.fn()
  const decorated = withPinActions(items, { t, pins, stable, pin, unpin })
  return { decorated, pin, unpin }
}

function runAction(action: PaletteRowAction | undefined) {
  if (action?.perform.kind === "run") action.perform.run()
}

describe("withPinActions", () => {
  it("appends Pin to a stable row that is not pinned, and running it pins the source id with the source label", () => {
    const users = row("nav:/users", { label: "Users" })

    const { decorated, pin, unpin } = decorate([users], stableOf(users), ready())
    runAction(decorated[0].actions?.[0])

    expect(decorated[0].actions).toMatchObject([{ id: PIN_ACTION_ID, label: "commandPalette.pins.pin", icon: Pin }])
    expect(pin).toHaveBeenCalledExactlyOnceWith("nav:/users", "Users")
    expect(unpin).not.toHaveBeenCalled()
  })

  it("appends Unpin to a stable row that is pinned, and running it unpins the source id", () => {
    const users = row("nav:/users", { label: "Users" })

    const { decorated, pin, unpin } = decorate([users], stableOf(users), ready("nav:/users"))
    runAction(decorated[0].actions?.[0])

    expect(decorated[0].actions).toMatchObject([{ id: UNPIN_ACTION_ID, label: "commandPalette.pins.unpin", icon: PinOff }])
    expect(unpin).toHaveBeenCalledExactlyOnceWith("nav:/users", "Users")
    expect(pin).not.toHaveBeenCalled()
  })

  it.each([
    ["a recent copy", toRecentRowId("nav:/users")],
    ["a pinned copy", toPinRowId("nav:/users")],
  ])("decorates %s with the action for its source id", (_name, copyId) => {
    const users = row("nav:/users", { label: "Users" })

    const { decorated, pin } = decorate([row(copyId, { label: "Copy label" })], stableOf(users), ready())
    runAction(decorated[0].actions?.[0])

    expect(pin).toHaveBeenCalledExactlyOnceWith("nav:/users", "Users")
  })

  it("keeps an existing first action first and appends the pin action after it", () => {
    const copyId: PaletteRowAction = { id: "copy-id", label: "Copy ID", icon: Settings, perform: { kind: "copy", value: "x" } }
    const users = row("nav:/users", { actions: [copyId] })

    const { decorated } = decorate([users], stableOf(users), ready())

    expect(decorated[0].actions?.map((action) => action.id)).toEqual(["copy-id", PIN_ACTION_ID])
  })

  it("leaves unchanged a row whose id is not in the stable lookup", () => {
    const searchHit = row("search:posts:1")

    const { decorated } = decorate([searchHit], stableOf(row("nav:/users")), ready())

    expect(decorated).toEqual([searchHit])
  })

  it.each([
    ["unavailable", { status: "unavailable" } as PalettePinsState],
    ["saving", { status: "ready", ids: [], saving: true } as PalettePinsState],
  ])("leaves every row unchanged while the pins are %s", (_name, pins) => {
    const users = row("nav:/users")

    const { decorated } = decorate([users], stableOf(users), pins)

    expect(decorated).toEqual([users])
  })

  it("leaves unchanged a row whose id exceeds PALETTE_PIN_ID_MAX_LENGTH", () => {
    const longId = `nav:${"a".repeat(PALETTE_PIN_ID_MAX_LENGTH)}`
    const longRow = row(longId)

    const { decorated } = decorate([longRow], stableOf(longRow), ready())

    expect(decorated).toEqual([longRow])
  })
})
