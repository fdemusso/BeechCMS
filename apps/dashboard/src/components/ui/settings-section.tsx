// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { rowDescriptionDomId, sectionDescriptionDomId, sectionDomId } from "@/components/ui/settings-section-ids"
import { cn } from "@/lib/utils"

interface SettingsSectionProps {
  /** Matches the bookmark id in the settings registry. */
  readonly id: string
  readonly title: string
  readonly description?: string
  /** The one thing to do in this section (create, invite, …), set at the end of the title row. */
  readonly action?: ReactNode
  readonly children: ReactNode
}

/**
 * A titled block of a settings page, drawn straight on the page background:
 *
 *     <section>  titled by its <h3>
 *       <h3>     the name, also where a sidebar bookmark puts the focus
 *       <p>      what it is for        (and, beside them, the section's one action)
 *       <div>    the rows: a <form>, a <ul>, or plain rows
 *
 * No card around it, so a page is a stack of sections separated by space alone.
 */
export function SettingsSection({ id, title, description, action, children }: SettingsSectionProps) {
  const headingId = `${sectionDomId(id)}-title`
  return (
    <section id={sectionDomId(id)} aria-labelledby={headingId} className="scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
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
        </div>
        {action}
      </div>
      <div className="mt-4 border-t border-border">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  readonly label: string
  /** Id of the control: turns the label into a real <label>. Without it the row is a named group. */
  readonly htmlFor?: string
  /**
   * For a control that names itself from the label with `aria-labelledby` (a radio group): the label gets this id and
   * the row is no group of its own, so the name is not said twice.
   */
  readonly labelId?: string
  readonly description?: string
  readonly children: ReactNode
  /** Width and alignment of the control column; inputs fill it, buttons and avatars sit at its end. */
  readonly controlClassName?: string
}

/** One function per row: what it is on the left, the control that changes it on the right. */
export function SettingsRow({ label, htmlFor, labelId: namedLabelId, description, children, controlClassName }: SettingsRowProps) {
  const ownLabelId = useId()
  const labelId = namedLabelId ?? ownLabelId
  const namesItsControl = htmlFor !== undefined || namedLabelId !== undefined
  const labelClassName = "text-sm font-medium text-foreground"
  return (
    <div
      // A row of buttons has no single control to label: the row itself is the named group.
      role={namesItsControl ? undefined : "group"}
      aria-labelledby={namesItsControl ? undefined : labelId}
      className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
    >
      <div className="min-w-0 sm:max-w-xs">
        {htmlFor
          ? <Label htmlFor={htmlFor} className={labelClassName}>{label}</Label>
          : <p id={labelId} className={labelClassName}>{label}</p>}
        {description && (
          <p id={htmlFor ? rowDescriptionDomId(htmlFor) : undefined} className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn("w-full shrink-0 sm:w-72", controlClassName)}>{children}</div>
    </div>
  )
}

/** The reason a field was refused, tied to it with `aria-describedby` and announced as it appears. */
export function SettingsFieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return <p id={id} role="alert" className="mt-1.5 text-sm text-destructive">{children}</p>
}

/** Read-only facts about the section, as a description list: each `SettingsReadout` is a term and what it is. */
export function SettingsReadouts({ children }: { readonly children: ReactNode }) {
  return <dl>{children}</dl>
}

export function SettingsReadout({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <dt className="text-sm font-medium text-foreground sm:max-w-xs">{label}</dt>
      <dd className="text-sm text-foreground sm:text-right">{children}</dd>
    </div>
  )
}

/** How many rows a list in a settings section shows before it scrolls. One number for every list. */
export const SETTINGS_VISIBLE_ROWS = 5

/** Height of a table row and of its header row, in rem. Keep `h-14` / `h-10` below in step: Tailwind reads whole class names only. */
export const SETTINGS_TABLE_ROW_REM = 3.5
export const SETTINGS_TABLE_HEAD_REM = 2.5
export const SETTINGS_TABLE_ROW_CLASS = "h-14"

/**
 * The rows of a section, in the shadcn ScrollArea, capped at `rows` of them: past that the list scrolls and the
 * page does not grow. The cap is exact because the rows have one fixed height (`rowRem`; a table's header adds
 * `headerRem`, and stays at the top while the rows move). The scrolling box is a named group in the tab order, so a
 * keyboard user can scroll it even when no row holds anything focusable. A group, not a region: the section around
 * it already is the region, and two landmarks must not share a name.
 */
export function SettingsScroll({
  label,
  rows = SETTINGS_VISIBLE_ROWS,
  rowRem,
  headerRem = 0,
  children,
}: {
  readonly label: string
  readonly rows?: number
  readonly rowRem: number
  readonly headerRem?: number
  readonly children: ReactNode
}) {
  return (
    <ScrollArea
      style={{ maxHeight: `${headerRem + rows * rowRem}rem` }}
      viewportProps={{ tabIndex: 0, role: "group", "aria-label": label }}
    >
      {children}
    </ScrollArea>
  )
}

/** The submit button of a group of rows, under the last divider. */
export function SettingsActions({ children }: { readonly children: ReactNode }) {
  return <div className="flex justify-end pt-4">{children}</div>
}
