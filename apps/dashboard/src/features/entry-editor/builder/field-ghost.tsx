// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { resolvePolicies, type Branch } from '@beechcms/core'
import { Calendar as CalendarIcon, Plus, Trash2, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { GripDots } from '@/components/ui/grip-dots'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton as BaseSkeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { FieldEdit, MultiRelationSkeleton } from '@/components/fields'

/**
 * Inert, data-less stand-ins for the field editors, drawn in the layout builder so a column looks like the
 * form it will become. Real controls (inputs, buttons, switches) are used at their real size and disabled;
 * skeletons stand in for what would be typed or loaded. The heavy editors (TipTap, CodeMirror) are never
 * mounted: a ghost only reproduces their footprint.
 */

/** The skeleton of a ghost: a notch darker than the default so it holds up against the dialog background. */
function Skeleton({ className, ...props }: React.ComponentProps<typeof BaseSkeleton>) {
  return <BaseSkeleton className={cn('bg-foreground/10', className)} {...props} />
}

/** Lengths of the skeleton text lines, cycled so a block does not look like a bar chart. */
const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-full', 'w-2/3', 'w-5/6', 'w-1/2'] as const

/**
 * A textbox with its skeleton text inside. It is a plain bordered box at the real input's size, not a
 * disabled `Input`: a faded input with a skeleton on top reads as two ghosts, one inside the other.
 */
function GhostInput({
  width = 'w-1/3',
  widthPercent,
  trailing,
}: {
  readonly width?: string
  /** Overrides `width` with a share of the box's inner width. */
  readonly widthPercent?: number
  readonly trailing?: React.ReactNode
}) {
  return (
    <div className="flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input px-2.5">
      <Skeleton
        className={cn('h-3', widthPercent === undefined && width)}
        style={widthPercent === undefined ? undefined : { width: `${widthPercent}%` }}
      />
      {trailing ? <span className="ml-auto text-muted-foreground">{trailing}</span> : null}
    </div>
  )
}

const TEXT_MIN_PERCENT = 30
const TEXT_MAX_PERCENT = 80

/** A text box whose imaginary line of text is a different length on every mount, so a seed with many text fields does not look stamped. */
function TextGhost() {
  const [percent] = React.useState(
    () => TEXT_MIN_PERCENT + Math.round(Math.random() * (TEXT_MAX_PERCENT - TEXT_MIN_PERCENT)),
  )
  return <GhostInput widthPercent={percent} />
}

/** Rich text: the editor's frame (400px, like the real one), its toolbar of real toggles, and text lines. */
function RichtextGhost() {
  const groups = [2, 3, 2, 2]
  return (
    <div className="flex min-h-[400px] w-full flex-col rounded-lg border">
      <div className="flex h-12 shrink-0 items-center gap-px overflow-hidden border-b p-2">
        {groups.map((count, group) => (
          <React.Fragment key={group}>
            {group > 0 ? <Separator orientation="vertical" className="mx-2" /> : null}
            {Array.from({ length: count }, (_, index) => (
              <Toggle key={index} size="sm" disabled>
                <Skeleton className="size-3.5" />
              </Toggle>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        {LINE_WIDTHS.map((width, index) => (
          <Skeleton key={index} className={cn('h-3', width)} />
        ))}
      </div>
    </div>
  )
}

/** JSON: the code editor's footprint — a gutter of line numbers and code lines of uneven length. */
function JsonGhost() {
  return (
    <div className="flex h-40 w-full flex-col gap-2 rounded-md border bg-muted/30 p-3">
      {LINE_WIDTHS.slice(0, 5).map((width, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-2.5 w-3 shrink-0" />
          <Skeleton className={cn('h-2.5', width)} />
        </div>
      ))}
    </div>
  )
}

/** File: the URL input with its upload button; a gallery (multiple files) adds two thumbnails. */
function FileGhost({ gallery }: { readonly gallery: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <GhostInput width="w-1/2" />
          </div>
          <Button type="button" variant="secondary" disabled aria-label={t('media.upload', 'Upload file')} className="shrink-0">
            <Upload className="size-4" />
          </Button>
        </div>
      </div>
      {gallery ? (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map((tile) => (
            <Skeleton key={tile} className="aspect-square rounded-lg border" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Tags: two chips and the round add button. */
function TagsGhost() {
  return (
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-6 w-12 rounded-full" />
      <Button type="button" variant="outline" size="icon-xs" disabled className="size-6 rounded-full">
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

/** Boolean: the real switch and a label-sized skeleton. */
function BooleanGhost() {
  return (
    <div className="flex items-center space-x-2">
      <Switch disabled />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/** Repeater: one item card (handle, title, remove, its first sub-fields) and the add button. */
function RepeaterGhost({ branch }: { readonly branch: Branch }) {
  const { t } = useTranslation()
  const subFields = (branch.fields ?? []).slice(0, 3)
  return (
    <div className="space-y-2">
      <div className="space-y-3 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2">
          <GripDots className="size-4 text-muted-foreground" />
          <span className="flex-1 text-xs font-medium text-muted-foreground">{t('fields.repeater.item')}</span>
          <Button type="button" variant="ghost" size="sm" disabled>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        <div className="space-y-2">
          {subFields.length > 0 ? (
            subFields.map((sub) => (
              <div key={sub.id} className="space-y-1">
                <Label className="text-xs">{sub.label || sub.alias}</Label>
                <GhostInput />
              </div>
            ))
          ) : (
            <GhostInput />
          )}
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" disabled className="w-full">
        <Plus className="mr-1 size-4" />
        {t('fields.repeater.addItem')}
      </Button>
    </div>
  )
}

/**
 * The builder's preview of one field's editor. Restricted (hashed) fields and single relations keep their
 * real editor, which is already cheap and shows its own placeholder.
 */
export const FieldGhost = React.memo(function FieldGhost({ branch }: { readonly branch: Branch }) {
  return <div aria-hidden>{ghostFor(branch)}</div>
})

function ghostFor(branch: Branch): React.ReactNode {
  if (resolvePolicies(branch).privacy === 'hash') {
    return <FieldEdit branch={branch} value="" onChange={() => {}} />
  }

  switch (branch.type) {
    case 'richtext':
      return <RichtextGhost />
    case 'json':
      return <JsonGhost />
    case 'file':
      return <FileGhost gallery={branch.multiple === true || branch.format === 'asset-list'} />
    case 'tags':
      return <TagsGhost />
    case 'boolean':
      return <BooleanGhost />
    case 'repeater':
      return <RepeaterGhost branch={branch} />
    case 'date':
      return <GhostInput trailing={<CalendarIcon className="size-4" />} />
    case 'number':
      return <GhostInput width="w-12" />
    case 'relation':
      return branch.multiple === true
        ? <MultiRelationSkeleton avatar={Boolean(branch.avatarSource)} />
        : <FieldEdit branch={branch} value="" onChange={() => {}} />
    default:
      return <TextGhost />
  }
}
