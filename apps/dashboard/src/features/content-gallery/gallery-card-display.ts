import type { ContentEntry } from "@/lib/dynamic-columns"
import { shouldShowPendingDraftBadge } from "@/lib/pending-draft"
import { extractTagChips, type TagChipData } from "@/lib/tags-utils"

import type { ResolvedCardFields } from "./resolve-card-fields"

export type StatusBadgeVariant = "default" | "secondary" | "outline" | "destructive"

export interface GalleryCardDisplayModel {
  entryId: string
  status: string
  tags: TagChipData[]
  imageUrl: string | null
  title: string
  excerpt: string
  dateText: string
  ariaLabel: string
  statusVariant: StatusBadgeVariant
  hasPendingDraft: boolean
}

export function getStatusBadgeVariant(status: string): StatusBadgeVariant {
  const normalized = status.trim().toLowerCase()
  if (!normalized) return "secondary"
  if (["error", "failed", "rejected", "archived"].includes(normalized)) return "destructive"
  if (["published", "active", "approved", "online"].includes(normalized)) return "default"
  return "outline"
}

export function resolveImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === "object") {
        return resolveImageUrl(parsed)
      }
    } catch {
      // Non è JSON: trattiamolo come URL diretto.
    }
    return trimmed
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const candidate = [obj.url, obj.src, obj.path].find(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    )
    return candidate?.trim() ?? null
  }

  return null
}

function toPlainText(value: unknown): string {
  if (typeof value === "string") {
    return value.replaceAll(/<[^>]*>/g, " ").replaceAll(/\s+/g, " ").trim()
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlainText(item)).join(" ").trim()
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => toPlainText(item))
      .join(" ")
      .trim()
  }
  return ""
}

function toExcerpt(value: unknown, maxChars = 50): string {
  const plain = toPlainText(value)
  if (!plain) return ""
  if (plain.length <= maxChars) return plain
  return `${plain.slice(0, maxChars).trimEnd()}…`
}

function formatDate(value: unknown): string {
  if (value == null || value === "") return ""
  const date = new Date(value as string | number)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("it-IT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function buildGalleryCardDisplayModel(
  entry: ContentEntry,
  branches: ResolvedCardFields
): GalleryCardDisplayModel {
  const status = entry.status?.trim() || "—"
  const tags = branches.tagsBranch
    ? extractTagChips(entry.data[branches.tagsBranch.alias])
    : []
  const imageUrl = branches.coverBranch
    ? resolveImageUrl(entry.data[branches.coverBranch.alias])
    : null
  const title = branches.titleBranch ? toPlainText(entry.data[branches.titleBranch.alias]) : ""
  const excerpt = branches.excerptBranch
    ? toExcerpt(entry.data[branches.excerptBranch.alias], 90)
    : ""
  const dateText = branches.dateBranch ? formatDate(entry.data[branches.dateBranch.alias]) : ""

  const ariaLabel = title
    ? `Apri dettaglio: ${title}`
    : `Apri dettaglio entry ${entry.id}`

  return {
    entryId: entry.id,
    status,
    tags,
    imageUrl,
    title,
    excerpt,
    dateText,
    ariaLabel,
    statusVariant: getStatusBadgeVariant(status),
    hasPendingDraft: shouldShowPendingDraftBadge(status, entry.has_pending_draft),
  }
}
