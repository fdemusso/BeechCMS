// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { CheckCircle2, Circle, AlertCircle, X, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { useSetupChecklist } from "@/features/dashboard"
import { cn } from "@/lib/utils"

const DISMISS_KEY = "beech_setup_checklist_dismissed"

export interface SetupChecklistWidgetProps {
  variant?: "full" | "compact"
}

export function SetupChecklistWidget({ variant = "full" }: SetupChecklistWidgetProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useSetupChecklist()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1")

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3">
        <Skeleton className="h-5 w-48 animate-pulse" />
      </div>
    )
  }

  if (isError || !data) return null

  const allDone = data.systemTablesOk && data.seedsCount > 0 && data.contentTablesOk && data.adminExists && data.hasContent

  if (allDone) {
    if (dismissed) return null
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-2.5 dark:border-emerald-800/40 dark:bg-emerald-500/10">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="flex-1 text-sm font-medium text-emerald-800 dark:text-emerald-300">
          {t("dashboard.setupChecklist.allDone")}
        </p>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true) }}
          className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  const items: Array<{
    done: boolean
    label: string
    hint?: string
    action?: { label: string; href?: string; command?: string }
  }> = [
    {
      done: data.systemTablesOk,
      label: t("dashboard.setupChecklist.systemTables"),
      hint: t("dashboard.setupChecklist.systemTablesHint"),
    },
    {
      done: data.seedsCount > 0,
      label: data.seedsCount > 0
        ? t("dashboard.setupChecklist.seeds", { count: data.seedsCount })
        : t("dashboard.setupChecklist.seedsNone"),
      action: data.seedsCount === 0
        ? { label: t("dashboard.setupChecklist.seedsAction"), href: "https://beechcms.dev/guide" }
        : undefined,
    },
    {
      done: data.contentTablesOk,
      label: t("dashboard.setupChecklist.contentTables"),
      action: !data.contentTablesOk
        ? { label: "npx beech seed:load --local", command: "npx beech seed:load --local" }
        : undefined,
    },
    {
      done: data.adminExists,
      label: t("dashboard.setupChecklist.adminAccount"),
      action: !data.adminExists
        ? { label: t("dashboard.setupChecklist.adminAction"), href: "/setup" }
        : undefined,
    },
    {
      done: data.hasContent,
      label: t("dashboard.setupChecklist.firstContent"),
      action: !data.hasContent && data.firstSeedSlug
        ? { label: t("dashboard.setupChecklist.firstContentAction"), href: `/content/${data.firstSeedSlug}/new` }
        : undefined,
    },
  ]

  const doneCount = items.filter(i => i.done).length

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="size-4 text-amber-500" />
        <p className="text-sm font-semibold">{t("dashboard.setupChecklist.title")}</p>
        <span className="ml-auto text-xs text-muted-foreground">{doneCount}/{items.length}</span>
      </div>

      {variant === "compact" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {items.map((item, i) => (
            <ChecklistItemCompact key={i} done={item.done} label={item.label} />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <ChecklistItemFull key={i} {...item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ChecklistItemCompact({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", done ? "text-muted-foreground line-through" : "text-foreground")}>
      {done
        ? <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
        : <Circle className="size-3 shrink-0 text-amber-400" />
      }
      {label}
    </span>
  )
}

function ChecklistItemFull({ done, label, hint, action }: {
  done: boolean
  label: string
  hint?: string
  action?: { label: string; href?: string; command?: string }
}) {
  return (
    <li className="flex items-start gap-2.5">
      {done
        ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      }
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}>
          {label}
        </p>
        {!done && hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
        {!done && action && (
          action.command ? (
            <code className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
              {action.command}
            </code>
          ) : action.href?.startsWith("http") ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {action.label}
              <ChevronRight className="size-3" />
            </a>
          ) : (
            <Link
              to={action.href!}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {action.label}
              <ChevronRight className="size-3" />
            </Link>
          )
        )}
      </div>
    </li>
  )
}
