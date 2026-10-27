// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { activityTarget } from "../../utils/activity-target"

type Activity = Parameters<typeof activityTarget>[0]

function activity(overrides: Partial<Activity> = {}): Activity {
  return { details: null, entity_slug: "posts", entity_id: "0b8e7c1e-4f55-4c36-9f7a-5d3f7c1a2b10", ...overrides }
}

describe("activityTarget", () => {
  it("names the entry by its title when the details carry one", () => {
    const row = activity({ details: { title: "Hello world", name: "ignored" } })

    expect(activityTarget(row)).toBe("Hello world")
  })

  it("falls back to the name when there is no title", () => {
    const row = activity({ details: { name: "Spring sale" } })

    expect(activityTarget(row)).toBe("Spring sale")
  })

  it("falls back to the seed slug when the details name nothing", () => {
    const row = activity({ details: { unrelated: 1 } })

    expect(activityTarget(row)).toBe("posts")
  })

  it("falls back to the entity id when there is no slug either", () => {
    const row = activity({ details: null, entity_slug: null })

    expect(activityTarget(row)).toBe("0b8e7c1e-4f55-4c36-9f7a-5d3f7c1a2b10")
  })

  it.each([
    ["an object title", { title: { en: "Hello" } }],
    ["an array title", { title: ["a", "b"] }],
    ["a numeric title", { title: 42 }],
    ["an empty title", { title: "" }],
  ])("ignores %s, which React could not render as a child", (_label, details) => {
    const row = activity({ details })

    expect(activityTarget(row)).toBe("posts")
  })
})
