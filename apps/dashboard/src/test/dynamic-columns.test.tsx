import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

// Mock toast: serve per coprire il ramo "Copia fallita" e "ID copiato"
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from "sonner"

import type { Seed } from "@beechcms/core"
import { DataTable } from "@/components/ui/data-table"
import { generateColumns, computeMaxLengths } from "@/lib/dynamic-columns"
import type { ContentEntry } from "@/lib/dynamic-columns"

function makeSeed({
  branches,
  slug = "items",
  label = "Item",
  labelPlural = "Items",
}: {
  branches: Seed["branches"]
  slug?: string
  label?: string
  labelPlural?: string
}): Seed {
  return {
    slug,
    label,
    labelPlural,
    branches,
  } as Seed
}

function makeEntry(id: string, schema_slug: string, data: Record<string, unknown>): ContentEntry {
  return {
    id,
    schema_slug,
    slug: "slug-" + id,
    status: "published",
    data,
    created_at: null,
    updated_at: null,
  } as ContentEntry
}

describe("dynamic-columns - computeMaxLengths", () => {
  it("calcola max con troncamento (min 20) e ignora campi json 'tag'", () => {
    const seed = makeSeed({
      branches: [
        { id: "b1", alias: "title", label: "Title", type: "text" as const },
        { id: "b2", alias: "body", label: "Body", type: "json" as const },
        // alias contiene 'tag' => computeMaxJsonLength ritorna null (nessun maxLength)
        { id: "b3", alias: "tagsImages", label: "Tags", type: "json" as const },
        { id: "b4", alias: "otherField", label: "Other", type: "unknown" as any },
      ] as any,
    })

    const data: ContentEntry[] = [
      makeEntry("1", "items", {
        title: "short",
        body: '{"a":"b"}',
        tagsImages: '{"react":"#111"}',
        otherField: "hello",
      }),
      makeEntry("2", "items", {
        title: "a bit longer than short",
        body: '{"a":"a","b":"b"}',
        tagsImages: '{"react":"#111","cms":"#222"}',
        otherField: "x",
      }),
    ]

    const max = computeMaxLengths(data, seed, 10)
    // text e json non-tag: almeno MIN_TRUNCATE_LENGTH
    expect(max.title).toBeGreaterThanOrEqual(20)
    expect(max.body).toBeGreaterThanOrEqual(20)
    expect(max.otherField).toBeGreaterThanOrEqual(20)
    // tags: non viene aggiunta a result
    expect(max).not.toHaveProperty("tagsImages")
  })

  it("applica un tetto massimo al troncamento per testi molto lunghi", () => {
    const seed = makeSeed({
      branches: [
        { id: "b1", alias: "body", label: "Body", type: "text" as const },
      ] as any,
    })

    const veryLong = "x".repeat(5000)
    const data: ContentEntry[] = [
      makeEntry("1", "items", { body: veryLong }),
    ]

    const max = computeMaxLengths(data, seed, 10)
    expect(max.body).toBe(60)
  })
})

describe("dynamic-columns - generateColumns aggregazioni e azioni", () => {
  const baseSeed = makeSeed({
    branches: [
      { id: "d1", alias: "publishedAt", label: "Published At", type: "date" as const },
      { id: "b1", alias: "active", label: "Active", type: "boolean" as const },
      { id: "n1", alias: "price", label: "Price", type: "number" as const },
      { id: "t1", alias: "title", label: "Title", type: "text" as const },
    ] as any,
  })

  it("date: getGroupingValue rispetta la precisione year-only e aggregatedCell gestisce voce/voci", () => {
    const cols = generateColumns(
      baseSeed,
      vi.fn(),
      vi.fn(),
      undefined,
      [],
      undefined,
      { year: true, month: false, day: false },
      (k) => (k === "content.table.items" ? "entries" : k)
    )

    const dateCol = cols.find((c) => c.id === "publishedAt") as any
    expect(dateCol).toBeTruthy()

    const groupingValue = dateCol.getGroupingValue({ data: { publishedAt: "2026-01-03" } })
    expect(groupingValue).toBe("2026")

    const el1 = dateCol.aggregatedCell({
      getValue: () => "2026",
      row: { subRows: [{}, {}] },
    })
    render(el1)
    expect(screen.getByText(/2026 · 2 entries/i)).toBeInTheDocument()
  })

  it("boolean: booleanAggFn conta true/false e aggregatedCell formatta ✓/✗", () => {
    const cols = generateColumns(baseSeed, vi.fn(), vi.fn())
    const boolCol = cols.find((c) => c.id === "active") as any

    const aggResult = boolCol.aggregationFn(
      "active",
      [
        { getValue: () => true },
        { getValue: () => false },
        { getValue: () => undefined },
      ] as any
    )

    expect(aggResult).toEqual({ trueCount: 1, falseCount: 1 })

    const el = boolCol.aggregatedCell({
      getValue: () => aggResult,
      row: { subRows: [{}] },
    })
    render(el)
    expect(screen.getByText(/✓ 1 \/ ✗ 1/)).toBeInTheDocument()
  })

  it("number: formatSum usa Σ quando value è number e fallback su NaN", () => {
    const cols = generateColumns(baseSeed, vi.fn(), vi.fn(), undefined, [], undefined, undefined, (k) => (k === "content.table.items" ? "entries" : k))
    const numCol = cols.find((c) => c.id === "price") as any

    const el = numCol.aggregatedCell({
      getValue: () => 10,
      row: { subRows: [{}, {}] },
    })
    const utils1 = render(el)
    expect(utils1.getByText(/Σ/)).toBeInTheDocument()
    expect(utils1.getByText(/2 entries/i)).toBeInTheDocument()
    utils1.unmount()

    const elNaN = numCol.aggregatedCell({
      getValue: () => Number.NaN,
      row: { subRows: [{}, {}] },
    })
    const utils2 = render(elNaN)
    expect(utils2.getByText(/2 entries/i)).toBeInTheDocument()
  })

  it("default/text: aggregatedCell rende 'entry' quando count=1 e 'entries' quando count>1", () => {
    const cols = generateColumns(baseSeed, vi.fn(), vi.fn(), undefined, [], undefined, undefined, (k) => {
      if (k === "content.table.item") return "entry"
      if (k === "content.table.items") return "entries"
      return k
    })
    const textCol = cols.find((c) => c.id === "title") as any

    const elSingle = textCol.aggregatedCell({
      row: { subRows: [{}] },
    })
    const utils1 = render(elSingle)
    expect(utils1.getByText(/1 entry/i)).toBeInTheDocument()
    utils1.unmount()

    const elMany = textCol.aggregatedCell({
      row: { subRows: [{}, {}] },
    })
    const utils2 = render(elMany)
    expect(utils2.getByText(/2 entries/i)).toBeInTheDocument()
  })

  it("status: mostra il badge bozza in sospeso quando has_pending_draft è true", async () => {
    const seed = makeSeed({ branches: [] })
    const entry = {
      ...makeEntry("id-1", "items", {}),
      status: "published",
      has_pending_draft: true,
    } as ContentEntry
    const t = (k: string) => {
      if (k === "content.table.pendingDraft") return "Pending draft"
      return k
    }
    const cols = generateColumns(seed, vi.fn(), vi.fn(), undefined, [], undefined, undefined, t)

    render(<DataTable columns={cols} data={[entry]} />)

    expect(await screen.findByText("published")).toBeInTheDocument()
    expect(await screen.findByText("Pending draft")).toBeInTheDocument()
  })

  it("status: non mostra il badge bozza in sospeso per entry archived", async () => {
    const seed = makeSeed({ branches: [] })
    const entry = {
      ...makeEntry("id-1", "items", {}),
      status: "archived",
      has_pending_draft: true,
    } as ContentEntry
    const t = (k: string) => {
      if (k === "content.table.pendingDraft") return "Pending draft"
      return k
    }
    const cols = generateColumns(seed, vi.fn(), vi.fn(), undefined, [], undefined, undefined, t)

    render(<DataTable columns={cols} data={[entry]} />)

    expect(await screen.findByText("archived")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText("Pending draft")).not.toBeInTheDocument()
    })
  })

  describe("azioni column", () => {
    beforeEach(() => {
      ;(toast.success as any).mockClear?.()
      ;(toast.error as any).mockClear?.()

      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      })
    })

    it("selectedIds vuoto: Copia ID (success) + Modifica + Elimina chiamano le callback", async () => {
      const onEdit = vi.fn()
      const onDelete = vi.fn()
      const onBulkDelete = vi.fn()

      const seed = makeSeed({ branches: [] })
      const entry = makeEntry("id-1", "items", {})
      const t = (k: string) => {
        const m: any = {
          "common.openMenu": "Open menu",
          "content.actions.label": "Actions",
          "common.delete": "Delete",
          "common.edit": "Edit",
          "content.actions.copyId": "Copy ID",
          "common.copied": "ID copied"
        }
        return m[k] || k
      }
      const cols = generateColumns(seed, onEdit, onDelete, undefined, [], onBulkDelete, undefined, t)

      render(<DataTable columns={cols} data={[entry]} />)

      fireEvent.pointerDown(screen.getByRole("button", { name: /Open menu/i }))

      expect(await screen.findByText("Copy ID")).toBeInTheDocument()
      fireEvent.click(screen.getByText("Edit"))
      expect(onEdit).toHaveBeenCalledWith("id-1")

      fireEvent.pointerDown(screen.getByRole("button", { name: /Open menu/i }))
      fireEvent.click(screen.getByText("Delete"))
      expect(onDelete).toHaveBeenCalledWith("id-1")

      fireEvent.pointerDown(screen.getByRole("button", { name: /Open menu/i }))
      fireEvent.click(screen.getByText("Copy ID"))

      await waitFor(() => {
        expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith("id-1")
        expect(toast.success).toHaveBeenCalledWith("ID copied")
      })
    })

    it("clipboard error: Copia ID chiama toast.error", async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("fail")),
        },
      })

      const onEdit = vi.fn()
      const onDelete = vi.fn()

      const seed = makeSeed({ branches: [] })
      const entry = makeEntry("id-1", "items", {})
      const t = (k: string) => {
        const m: any = {
          "common.openMenu": "Open menu",
          "content.actions.copyId": "Copy ID",
          "common.copyFailed": "Copy failed"
        }
        return m[k] || k
      }
      const cols = generateColumns(seed, onEdit, onDelete, undefined, [], undefined, undefined, t)

      render(<DataTable columns={cols} data={[entry]} />)
      fireEvent.pointerDown(screen.getByRole("button", { name: /Open menu/i }))
      fireEvent.click(screen.getByText("Copy ID"))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Copy failed")
      })
    })

    it("selectedIds > 1: mostra solo Elimina e usa onBulkDelete", async () => {
      const onDelete = vi.fn()
      const onBulkDelete = vi.fn()

      const seed = makeSeed({ branches: [] })
      const entry = makeEntry("id-1", "items", {})
      const t = (k: string) => (k === "common.delete" || k === "common.openMenu") ? (k === "common.delete" ? "Delete" : "Open menu") : k
      const cols = generateColumns(seed, vi.fn(), onDelete, undefined, ["id-1", "id-2"], onBulkDelete, undefined, t)

      render(<DataTable columns={cols} data={[entry]} />)
      fireEvent.pointerDown(screen.getByRole("button", { name: /Open menu/i }))

      expect(await screen.findByText("Delete")).toBeInTheDocument()
      expect(screen.queryByText("Copy ID")).not.toBeInTheDocument()

      fireEvent.click(screen.getByText("Delete"))
      expect(onBulkDelete).toHaveBeenCalledWith(["id-1", "id-2"])
    })
  })
})
