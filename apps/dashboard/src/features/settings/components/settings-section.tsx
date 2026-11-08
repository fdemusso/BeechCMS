// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Id the sidebar bookmarks scroll to: `?settings=<tab>&section=<id>` lands on `settings-section-<id>`. */
export const sectionDomId = (id: string) => `settings-section-${id}`

/** Id of a section's description, for a form inside it to point at with `aria-describedby`. */
export const sectionDescriptionDomId = (id: string) => `${sectionDomId(id)}-description`

interface SettingsSectionProps {
  /** Matches the bookmark id in the settings registry. */
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
}

/**
 * A titled block of a settings page, drawn straight on the page background:
 *
 *     <section>  titled by its <h3>
 *       <h3>     the name, also where a sidebar bookmark puts the focus
 *       <p>      what it is for
 *       <div>    the rows: a <form>, a <ul>, or plain rows
 *
 * No card around it, so a page is a stack of sections separated by space alone.
 */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${sectionDomId(id)}-title`
  return (
    <section id={sectionDomId(id)} aria-labelledby={headingId} className="scroll-mt-4">
      <h3
        id={headingId}
        // Not in the tab order, but a bookmark can send the focus here so a screen reader starts reading the section.
        tabIndex={-1}
        className="font-heading text-base font-semibold tracking-tight text-foreground outline-none focus-visible:underline"
      >
        {title}
      </h3>
      {description && (
        <p id={sectionDescriptionDomId(id)} className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 border-t border-border">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  readonly label: string
  /** Id of the control: turns the label into a real <label>. Without it the row is a named group. */
  readonly htmlFor?: string
  readonly description?: string
  readonly children: ReactNode
  /** Width and alignment of the control column; inputs fill it, buttons and avatars sit at its end. */
  readonly controlClassName?: string
}

/** One function per row: what it is on the left, the control that changes it on the right. */
export function SettingsRow({ label, htmlFor, description, children, controlClassName }: SettingsRowProps) {
  const labelId = useId()
  const labelClassName = "text-sm font-medium text-foreground"
  return (
    <div
      // A row of buttons has no single control to label: the row itself is the named group.
      role={htmlFor ? undefined : "group"}
      aria-labelledby={htmlFor ? undefined : labelId}
      className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
    >
      <div className="min-w-0 sm:max-w-xs">
        {htmlFor
          ? <Label htmlFor={htmlFor} className={labelClassName}>{label}</Label>
          : <p id={labelId} className={labelClassName}>{label}</p>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("w-full shrink-0 sm:w-72", controlClassName)}>{children}</div>
    </div>
  )
}

/** The reason a field was refused, tied to it with `aria-describedby` and announced as it appears. */
export function SettingsFieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return <p id={id} role="alert" className="mt-1.5 text-sm text-destructive">{children}</p>
}

/** The submit button of a group of rows, under the last divider. */
export function SettingsActions({ children }: { readonly children: ReactNode }) {
  return <div className="flex justify-end pt-4">{children}</div>
}
