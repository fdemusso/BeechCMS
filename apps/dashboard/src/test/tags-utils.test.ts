import { describe, it, expect } from "vitest"

import { parseTagsValue, extractTagNames } from "@/lib/tags-utils"

describe("tags-utils", () => {
  it("parseTagsValue fa parse JSON string quando valido", () => {
    expect(parseTagsValue('{"react":"#fff"}')).toEqual({ react: "#fff" })
  })

  it("parseTagsValue ritorna valore originale su JSON non valido", () => {
    expect(parseTagsValue("{bad")).toBe("{bad")
  })

  it("extractTagNames estrae nomi da array/stringhe e oggetti", () => {
    expect(extractTagNames('[" react ", "cms"]')).toEqual(["react", "cms"])
    expect(extractTagNames({ react: "#fff", cms: "#000" })).toEqual(["react", "cms"])
    expect(extractTagNames(null)).toEqual([])
  })
})
