// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import i18n from "i18next"
import enStrings from "@/locales/en.json"
import itStrings from "@/locales/it.json"
import type { ActivityEntry } from "../types/settings.types"
import { describeActivity, describeUserAgent } from "./activity-presentation"

const instance = i18n.createInstance()
void instance.init({
  lng: "en",
  resources: { en: { translation: enStrings }, it: { translation: itStrings } },
  interpolation: { escapeValue: false },
})
const t = (key: string, options?: Record<string, unknown>) => instance.t(key, options) as string
const tIt = (key: string, options?: Record<string, unknown>) => instance.getFixedT("it")(key, options) as string

/** A row as the API sends it. Actions and entity types are plain strings here so a test can also send one the dashboard has never heard of. */
function entry(
  partial: { action: string; entity_type: string; entity_id?: string; entity_slug?: string | null },
  details: unknown = null,
): ActivityEntry {
  return {
    id: "x", entity_id: "e1", entity_slug: null, created_at: 1_700_000_000,
    details: details === null ? null : JSON.stringify(details),
    ...partial,
  } as unknown as ActivityEntry
}

describe("describeActivity", () => {
  it("keeps a trashed entry apart from a purged one and from a restore", () => {
    const base = { entity_type: "content", entity_slug: "posts", entity_id: "p1" }
    const trash = describeActivity(entry({ ...base, action: "trash" }, { title: "Hello" }), t)
    const purge = describeActivity(entry({ ...base, action: "purge" }, { title: "Hello" }), t)
    const restore = describeActivity(entry({ ...base, action: "restore" }, { title: "Hello" }), t)

    expect([trash.label, purge.label, restore.label]).toEqual(["Moved to trash", "Permanently deleted", "Restored"])
    expect(purge.tone).toBe("destructive")
    expect(trash.tone).toBe("outline")
    expect(trash).toMatchObject({ title: "Hello", detail: "posts" })
  })

  it("says how many entries a bulk operation touched", () => {
    const bulk = describeActivity(entry({ action: "restore", entity_type: "content", entity_slug: "posts", entity_id: "posts" }, { op: "bulk", count: 3 }), t)
    expect(bulk).toMatchObject({ title: "3 entries", detail: "posts" })

    const edit = describeActivity(entry({ action: "bulk_update", entity_type: "content", entity_slug: "posts", entity_id: "posts" }, { count: 4, fields: ["status", "tags"] }), t)
    expect(edit).toMatchObject({ label: "Bulk edit", title: "4 entries", detail: "posts · fields: status, tags" })
  })

  it("only a saved draft carries its note", () => {
    const saved = describeActivity(entry({ action: "update", entity_type: "content", entity_slug: "posts", entity_id: "p1" }, { title: "Hello", note: "draft saved" }), t)
    expect(saved.detail).toBe("posts · Draft saved")

    const published = describeActivity(entry({ action: "publish", entity_type: "content", entity_slug: "posts", entity_id: "p1" }, { title: "Hello", note: "draft published" }), t)
    expect(published).toMatchObject({ label: "Published", detail: "posts" })
  })

  it("names an upload by its file, not by the word media", () => {
    const upload = describeActivity(entry({ action: "upload", entity_type: "media", entity_id: "k1" }, { name: "cover.png", size: 2048 }), t)
    expect(upload).toMatchObject({ label: "Uploaded", title: "cover.png", detail: "Media · 2.0 KB" })
  })

  it("shows where a sign-in came from, with the browser, and why a failed one failed", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
    const login = describeActivity(entry({ action: "login", entity_type: "auth", entity_id: "u1" }, { ip: "203.0.113.7", country: "IT", city: "Milano", userAgent: ua }), t)
    expect(login).toMatchObject({ label: "Signed in", title: "Milano, IT", detail: "203.0.113.7 · Chrome · Windows" })

    const failed = describeActivity(entry({ action: "login_failed", entity_type: "auth", entity_id: "u1" }, { ip: "198.51.100.9", reason: "wrong-password" }), t)
    expect(failed).toMatchObject({ label: "Failed sign-in", tone: "destructive", title: "198.51.100.9", detail: "Wrong password" })
  })

  it("describes account changes by what changed, never a value", () => {
    const password = describeActivity(entry({ action: "update", entity_type: "user", entity_id: "u1" }, { op: "password", sessionsRevoked: true }), t)
    expect(password).toMatchObject({ title: "Password changed", detail: "other sessions signed out" })

    const profile = describeActivity(entry({ action: "update", entity_type: "user", entity_id: "u1" }, { op: "profile", fields: ["name", "email"] }), t)
    expect(profile).toMatchObject({ title: "Profile updated", detail: "fields: name, email" })
  })

  it("names who got which role, and where", () => {
    const assigned = describeActivity(entry({ action: "create", entity_type: "assignment", entity_id: "a1" }, { email: "ada@example.com", role: "Editor", scope: "*" }), t)
    expect(assigned).toMatchObject({ title: "ada@example.com · Editor", detail: "Role assignment · all content" })
  })

  it("covers every action and entity the API can write, in both languages", () => {
    const actions = ["create", "update", "delete", "upload", "bulk_update", "security_alert", "trash", "restore", "purge", "publish", "discard_draft", "import", "revoke", "accept", "authorize", "login", "login_failed", "logout"]
    const entities = ["content", "media", "seed", "user", "role", "assignment", "invitation", "settings", "session", "auth", "app", "automation", "layout", "view"]
    for (const action of actions) {
      const key = `settings.activity.actions.${action}`
      expect(t(key), `en ${action}`).not.toBe(key)
      expect(tIt(key), `it ${action}`).not.toBe(key)
    }
    for (const entity of entities) {
      const key = `settings.activity.entities.${entity}`
      expect(t(key), `en ${entity}`).not.toBe(key)
      expect(tIt(key), `it ${entity}`).not.toBe(key)
    }
  })

  it("never lets a non-text value reach the screen", () => {
    const view = describeActivity(entry({ action: "update", entity_type: "content", entity_slug: "posts", entity_id: "p1" }, { title: { nested: true }, note: 42 }), t)
    expect(view.title).toBe("posts")
  })

  it("survives malformed details and unknown kinds", () => {
    const broken = describeActivity({ ...entry({ action: "update", entity_type: "content", entity_id: "p1" }), details: "{not json" } as ActivityEntry, t)
    expect(broken.title).toBe("p1")

    const unknown = describeActivity(entry({ action: "frobnicate", entity_type: "gizmo", entity_id: "g1" }), t)
    expect(unknown).toMatchObject({ label: "frobnicate", title: "gizmo" })
  })
})

describe("describeUserAgent", () => {
  it("names the browser and the system, and nothing else", () => {
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe("Safari · macOS")
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge · Windows")
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox · Linux")
    expect(describeUserAgent(null)).toBeNull()
  })
})
