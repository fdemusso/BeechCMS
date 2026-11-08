// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Id the sidebar bookmarks scroll to: `?settings=<tab>&section=<id>` lands on `settings-section-<id>`. */
export const sectionDomId = (id: string) => `settings-section-${id}`

interface SettingsSectionProps {
  /** Matches the bookmark id in the settings registry. */
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
}

/**
 * A titled block of a settings page, drawn straight on the page background: the title, a divider, then a list
 * of rows. No card around it, so a page is a stack of sections separated by space alone.
 */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${sectionDomId(id)}-title`
  return (
    <section id={sectionDomId(id)} aria-labelledby={headingId} className="scroll-mt-4">
      <h3 id={headingId} className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 border-t border-border">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  readonly label: string
  /** Id of the control: turns the label into a real <label>. */
  readonly htmlFor?: string
  readonly description?: string
  readonly children: ReactNode
  /** Width and alignment of the control column; inputs fill it, buttons and avatars sit at its end. */
  readonly controlClassName?: string
}

/** One function per row: what it is on the left, the control that changes it on the right. */
export function SettingsRow({ label, htmlFor, description, children, controlClassName }: SettingsRowProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-xs">
        {htmlFor
          ? <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</Label>
          : <p className="text-sm font-medium text-foreground">{label}</p>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("w-full shrink-0 sm:w-72", controlClassName)}>{children}</div>
    </div>
  )
}

/** The submit button of a group of rows, under the last divider. */
export function SettingsActions({ children }: { readonly children: ReactNode }) {
  return <div className="flex justify-end pt-4">{children}</div>
}
