// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, expect, it } from "vitest"

import "../../view-registry.bootstrap"
import { viewRegistry } from "../../view-registry"

describe("view-registry.bootstrap", () => {
  it("registers transfer as an enabled tool on every view (table, gallery, kanban)", () => {
    const types = viewRegistry.list().map((def) => def.type)

    expect(types).toEqual(expect.arrayContaining(["table", "gallery", "kanban"]))
    for (const def of viewRegistry.list()) {
      expect(def.enabledTools).toContain("transfer")
    }
  })
})
