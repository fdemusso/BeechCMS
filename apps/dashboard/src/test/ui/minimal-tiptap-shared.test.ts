import { describe, it, expect } from "vitest"

/**
 * Tests for pure utility functions extracted from minimal-tiptap into shared.ts
 * during Sprint 01 Phase C1.
 *
 * Editor-coupled functions (getOutput, blobUrlToBase64, fileToBase64, filterFiles)
 * that require a TipTap Editor instance or FileReader/fetch are excluded here and
 * are covered implicitly by the editor's smoke tests.
 */
import {
  isClient,
  isServer,
  getShortcutKey,
  getShortcutKeys,
  isUrl,
  sanitizeUrl,
  randomId,
} from "@/components/ui/minimal-tiptap/shared"

// ---------------------------------------------------------------------------
// isClient / isServer
// ---------------------------------------------------------------------------

describe("isClient / isServer", () => {
  it("isClient returns true in jsdom environment", () => {
    expect(isClient()).toBe(true)
  })

  it("isServer returns false in jsdom environment", () => {
    expect(isServer()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getShortcutKey
// ---------------------------------------------------------------------------

describe("getShortcutKey", () => {
  it("restituisce il carattere letterale per tasti non mappati", () => {
    const result = getShortcutKey("X")
    expect(result.symbol).toBe("X")
    expect(result.readable).toBe("X")
  })

  it("mappa 'shift' correttamente su tutte le piattaforme", () => {
    const result = getShortcutKey("shift")
    expect(result.symbol).toBe("⇧")
    expect(result.readable).toBe("Shift")
  })

  it("è case-insensitive", () => {
    expect(getShortcutKey("SHIFT").symbol).toBe("⇧")
    expect(getShortcutKey("Shift").symbol).toBe("⇧")
  })
})

// ---------------------------------------------------------------------------
// getShortcutKeys
// ---------------------------------------------------------------------------

describe("getShortcutKeys", () => {
  it("restituisce un array di risultati nella stessa lunghezza dell'input", () => {
    const results = getShortcutKeys(["mod", "shift", "K"])
    expect(results).toHaveLength(3)
    expect(results[1].symbol).toBe("⇧")
    expect(results[2].symbol).toBe("K")
  })

  it("restituisce array vuoto per input vuoto", () => {
    expect(getShortcutKeys([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isUrl
// ---------------------------------------------------------------------------

describe("isUrl", () => {
  it("accetta URL http/https validi", () => {
    expect(isUrl("https://example.com")).toBe(true)
    expect(isUrl("http://example.com/path?q=1")).toBe(true)
  })

  it("rifiuta stringhe che non sono URL", () => {
    expect(isUrl("not a url")).toBe(false)
    expect(isUrl("")).toBe(false)
  })

  it("rifiuta protocolli pericolosi (javascript:, file:)", () => {
    expect(isUrl("javascript:alert(1)")).toBe(false)
    expect(isUrl("file:///etc/passwd")).toBe(false)
    expect(isUrl("vbscript:msgbox(1)")).toBe(false)
  })

  it("rifiuta URL con newline", () => {
    expect(isUrl("https://example.com\nhttps://evil.com")).toBe(false)
  })

  it("rifiuta data: URL quando allowBase64 è false (default)", () => {
    const base64 = "data:image/png;base64,iVBORw0KGgo="
    expect(isUrl(base64)).toBe(false)
  })

  it("accetta data: URL quando allowBase64 è true e il pattern è valido", () => {
    const base64 = "data:image/png;base64,iVBORw0KGgo="
    expect(isUrl(base64, { requireHostname: false, allowBase64: true })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sanitizeUrl
// ---------------------------------------------------------------------------

describe("sanitizeUrl", () => {
  it("restituisce undefined per valori nullish", () => {
    expect(sanitizeUrl(null)).toBeUndefined()
    expect(sanitizeUrl(undefined)).toBeUndefined()
    expect(sanitizeUrl("")).toBeUndefined()
  })

  it("restituisce l'URL invariato se già valido", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com")
  })

  it("antepone https:// a URL senza schema", () => {
    expect(sanitizeUrl("example.com")).toBe("https://example.com")
  })

  it("preserva URL relativi (/, #, mailto:)", () => {
    expect(sanitizeUrl("/path/to/page")).toBe("/path/to/page")
    expect(sanitizeUrl("#anchor")).toBe("#anchor")
    expect(sanitizeUrl("mailto:user@example.com")).toBe("mailto:user@example.com")
  })
})

// ---------------------------------------------------------------------------
// randomId
// ---------------------------------------------------------------------------

describe("randomId", () => {
  it("genera stringhe non vuote", () => {
    expect(randomId().length).toBeGreaterThan(0)
  })

  it("genera ID univoci tra chiamate successive", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomId()))
    expect(ids.size).toBe(50)
  })
})
