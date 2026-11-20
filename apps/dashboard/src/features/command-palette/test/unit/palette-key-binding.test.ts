// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { paletteKeyBinding } from "../../lib/palette-key-binding"

type KeyEvent = Parameters<typeof paletteKeyBinding>[0]

function keyEvent(overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  }
}

describe("paletteKeyBinding", () => {
  it("plain Enter and Alt+Enter are not palette bindings and return null", () => {
    const events = [keyEvent(), keyEvent({ altKey: true })]

    const bindings = events.map(paletteKeyBinding)

    expect(bindings).toEqual([null, null])
  })

  it("Ctrl+Enter and Meta+Enter return secondary-action", () => {
    const events = [keyEvent({ ctrlKey: true }), keyEvent({ metaKey: true })]

    const bindings = events.map(paletteKeyBinding)

    expect(bindings).toEqual(["secondary-action", "secondary-action"])
  })

  it("Shift+Enter returns open-actions", () => {
    const binding = paletteKeyBinding(keyEvent({ shiftKey: true }))

    expect(binding).toBe("open-actions")
  })

  it("Ctrl+Shift+Enter returns secondary-action because Mod wins over Shift", () => {
    const binding = paletteKeyBinding(keyEvent({ ctrlKey: true, shiftKey: true }))

    expect(binding).toBe("secondary-action")
  })

  it("a composing Ctrl+Enter returns null", () => {
    // IME confirmation uses Enter; cmdk skips composing events and so must the engine.
    const binding = paletteKeyBinding(keyEvent({ ctrlKey: true, isComposing: true }))

    expect(binding).toBeNull()
  })

  it("Ctrl with a key other than Enter returns null", () => {
    const binding = paletteKeyBinding(keyEvent({ key: "k", ctrlKey: true }))

    expect(binding).toBeNull()
  })
})
