// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ActivityEntry } from "../types/settings.types"

type Translate = (key: string, options?: Record<string, unknown>) => string

export type ActivityTone = "default" | "secondary" | "destructive" | "outline"

export interface ActivityView {
  /** Translated name of what happened: the badge. */
  readonly label: string
  readonly tone: ActivityTone
  /** What it happened to. Never empty. */
  readonly title: string
  /** Everything else worth a second line, or `null`. */
  readonly detail: string | null
}

/** Irreversible or security-relevant events stand out; routine ones do not. */
const TONES: Record<string, ActivityTone> = {
  create: "default", login: "default", accept: "default", authorize: "default", publish: "default", restore: "default", import: "default",
  update: "secondary", bulk_update: "secondary",
  delete: "destructive", purge: "destructive", revoke: "destructive", login_failed: "destructive", security_alert: "destructive",
  upload: "outline", trash: "outline", discard_draft: "outline", logout: "outline",
}

type Details = Record<string, unknown>

function parseDetails(raw: string | null): Details {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Details) : {}
  } catch {
    return {}
  }
}

/** Only real, non-empty text reaches the screen: a stored object must never become a React child. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function join(parts: ReadonlyArray<string | null | undefined>): string | null {
  const kept = parts.filter((part): part is string => !!part)
  return kept.length > 0 ? kept.join(" · ") : null
}

/** "Chrome on Windows" from a user agent; the raw string is never shown. */
export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\/|Opera/.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : null
  const system =
    /Windows/.test(userAgent) ? "Windows"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux|X11/.test(userAgent) ? "Linux"
    : null
  if (browser && system) return `${browser} · ${system}`
  return browser ?? system
}

/** "Milano, IT" / "IT" / `null`, from what the edge reported. */
function describePlace(details: Details): string | null {
  return [text(details.city), text(details.country)].filter(Boolean).join(", ") || null
}

/**
 * Turns one stored activity row into what a person reads: a badge saying what happened, the thing it happened to,
 * and one line of context. One function for every kind of row, so a new event is described in one place.
 */
export function describeActivity(entry: ActivityEntry, t: Translate): ActivityView {
  const details = parseDetails(entry.details)
  const action = entry.action as string
  const entityType = entry.entity_type as string

  const label = t(`settings.activity.actions.${action}`, { defaultValue: action })
  const tone = TONES[action] ?? "secondary"
  const entityLabel = t(`settings.activity.entities.${entityType}`, { defaultValue: entityType })

  const op = text(details.op)
  const opLabel = op ? t(`settings.activity.ops.${op}`, { defaultValue: op }) : null
  const fields = Array.isArray(details.fields) ? details.fields.filter((f): f is string => typeof f === "string") : []
  const count = typeof details.count === "number" ? details.count : null
  const scope = text(details.scope)
  const scopeLabel = scope ? (scope === "*" ? t("settings.activity.allContent") : scope) : null

  switch (entityType) {
    case "content": {
      if (op === "bulk" && count !== null) {
        return { label, tone, title: t("settings.activity.entries", { count }), detail: entry.entity_slug }
      }
      if (action === "bulk_update" && count !== null) {
        return {
          label, tone, title: t("settings.activity.entries", { count }),
          detail: join([entry.entity_slug, fields.length ? t("settings.activity.fields", { fields: fields.join(", ") }) : null]),
        }
      }
      const note = text(details.note)
      // The badge already says "published" or "discarded"; only a saved draft needs the note.
      const noteLabel = note && action === "update" ? t(`settings.activity.ops.${note.replace(/ /g, "-")}`, { defaultValue: note }) : null
      return {
        label, tone,
        title: text(details.title) ?? entry.entity_slug ?? entry.entity_id,
        detail: join([entry.entity_slug, noteLabel ?? opLabel]),
      }
    }

    case "media": {
      if (op === "orphans" && count !== null) {
        return { label, tone, title: t("settings.activity.orphans", { count }), detail: null }
      }
      const size = typeof details.size === "number" ? formatBytes(details.size) : null
      return { label, tone, title: text(details.name) ?? entry.entity_id, detail: join([entityLabel, size]) }
    }

    case "seed":
      return { label, tone, title: entry.entity_slug ?? entry.entity_id, detail: join([entityLabel, opLabel, text(details.alias)]) }

    case "auth": {
      const place = describePlace(details)
      const ip = text(details.ip)
      const reason = text(details.reason)
      const reasonLabel = reason ? t(`settings.activity.reasons.${reason}`, { defaultValue: reason }) : null
      return {
        label, tone,
        title: place ?? ip ?? entityLabel,
        detail: join([place ? ip : null, describeUserAgent(text(details.userAgent)), reasonLabel]),
      }
    }

    case "assignment":
      return { label, tone, title: join([text(details.email), text(details.role)]) ?? entityLabel, detail: join([entityLabel, scopeLabel]) }

    case "invitation":
      return { label, tone, title: text(details.email) ?? entityLabel, detail: join([entityLabel, text(details.role), scopeLabel, opLabel]) }

    case "app":
      return { label, tone, title: text(details.client) ?? entry.entity_id, detail: entityLabel }

    case "role":
    case "automation":
    case "view":
      return { label, tone, title: text(details.name) ?? text(details.title) ?? entry.entity_id, detail: join([entityLabel, opLabel, entry.entity_slug]) }

    case "user":
      // Profile, password, photo and notification changes say what changed, never the values.
      return {
        label, tone,
        title: opLabel ?? entityLabel,
        detail: join([text(details.email), fields.length ? t("settings.activity.fields", { fields: fields.join(", ") }) : null, details.sessionsRevoked === true ? t("settings.activity.sessionsRevoked") : null]),
      }

    case "settings":
      return { label, tone, title: opLabel ?? entityLabel, detail: fields.length ? t("settings.activity.fields", { fields: fields.join(", ") }) : null }

    default: {
      // Session, dashboard layout and whatever comes next: the operation if there is one, else the kind of thing.
      const title = opLabel ?? text(details.name) ?? text(details.title) ?? entityLabel
      return { label, tone, title, detail: title === entityLabel ? null : entityLabel }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
