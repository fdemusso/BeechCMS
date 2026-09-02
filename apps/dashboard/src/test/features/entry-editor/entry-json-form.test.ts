// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import {
  prepareSubmissionPayload,
  validateEntryJsonFields,
  type EditorBranch,
} from "@/features/entry-editor/hooks/use-entry-editor-dialog"

describe("entry-json-form contract", () => {
  const branches: EditorBranch[] = [
    { alias: "title", label: "Title", type: "text" },
    { alias: "settings", label: "Settings JSON", type: "json" },
    { alias: "tags", label: "Tags JSON", type: "json" },
  ]

  describe("prepareSubmissionPayload", () => {
    it("deserializes valid json string to an object", () => {
      const payload = prepareSubmissionPayload({
        branches,
        formData: {
          title: "My Entry",
          settings: '{"foo":"bar"}',
        },
        slug: "my-entry",
        status: "published",
      })

      expect(payload.settings).toEqual({ foo: "bar" })
      expect(payload.title).toBe("My Entry")
      expect(payload.slug).toBe("my-entry")
      expect(payload.status).toBe("published")
    })

    it("normalizes empty string and whitespace to empty object {}", () => {
      const payload = prepareSubmissionPayload({
        branches,
        formData: {
          title: "Blank Test",
          settings: "",
          tags: "   ",
        },
        slug: "blank-test",
        status: "published",
      })

      expect(payload.settings).toEqual({})
      expect(payload.tags).toEqual({})
    })

    it("normalizes null and undefined to empty object {}", () => {
      const payload = prepareSubmissionPayload({
        branches,
        formData: {
          title: "Null Test",
          settings: null,
          tags: undefined,
        },
        slug: "null-test",
        status: "draft",
      })

      expect(payload.settings).toEqual({})
      expect(payload.tags).toEqual({})
    })

    it("omits json branch from payload when not present in formData", () => {
      const payload = prepareSubmissionPayload({
        branches,
        formData: {
          title: "Omitted Test",
        },
        slug: "omitted-test",
        status: "draft",
      })

      expect(payload.title).toBe("Omitted Test")
      expect(payload.settings).toBeUndefined()
      expect(payload.tags).toBeUndefined()
    })

    it("passes through object value if already deserialized", () => {
      const payload = prepareSubmissionPayload({
        branches,
        formData: {
          settings: { direct: true },
        },
        slug: "object-test",
        status: "published",
      })

      expect(payload.settings).toEqual({ direct: true })
    })
  })

  describe("validateEntryJsonFields", () => {
    it("returns isValid: true for empty string, whitespace, and valid json string", () => {
      const emptyResult = validateEntryJsonFields(branches, {
        settings: "",
        tags: "   ",
      })
      expect(emptyResult).toEqual({ isValid: true })

      const validResult = validateEntryJsonFields(branches, {
        settings: '{"a": 1}',
        tags: '["one", "two"]',
      })
      expect(validResult).toEqual({ isValid: true })
    })

    it("returns isValid: true when json fields are null or undefined", () => {
      const result = validateEntryJsonFields(branches, {
        settings: null,
      })
      expect(result).toEqual({ isValid: true })
    })

    it("returns isValid: false with label when json string is malformed", () => {
      const result = validateEntryJsonFields(branches, {
        settings: ' { malformed JSON ',
      })
      expect(result).toEqual({
        isValid: false,
        errorFieldLabel: "Settings JSON",
      })
    })

    it("ignores malformed strings on non-json branches", () => {
      const result = validateEntryJsonFields(branches, {
        title: "This is definitely { not valid json",
        settings: '{"valid": true}',
      })
      expect(result).toEqual({ isValid: true })
    })
  })
})
