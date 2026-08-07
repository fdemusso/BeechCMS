// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Export as ExternalLink, Loader as Loader2 } from 'reicon-react'
import { formatDistanceToNow } from 'date-fns'
import { it as itLocale, enUS, type Locale } from 'date-fns/locale'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBackrefs, useBackrefsGroup } from './hooks/use-backrefs'
import type { BackrefGroup, BackrefItem } from './api'

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function useLocaleForDate(): Locale {
  const { i18n } = useTranslation()
  return i18n.language.startsWith('it') ? itLocale : enUS
}

function RelativeTime({ timestamp, locale }: { timestamp: number | null; locale: Locale }) {
  if (!timestamp) return null
  return (
    <span className="text-xs text-muted-foreground">
      {formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true, locale })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Per-group paginated dialog
// ---------------------------------------------------------------------------

interface GroupDialogProps {
  targetSlug: string
  targetId: string
  group: BackrefGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GroupDialog({ targetSlug, targetId, group, open, onOpenChange }: GroupDialogProps) {
  const { t } = useTranslation()
  const locale = useLocaleForDate()
  const [page, setPage] = React.useState(1)
  const LIMIT = 20

  const { data, isLoading } = useBackrefsGroup(
    targetSlug,
    targetId,
    group.sourceSlug,
    group.branchAlias,
    page,
    LIMIT,
  )

  const items = data?.groups[0]?.items ?? []
  const total = data?.groups[0]?.total ?? group.total
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {group.sourceLabel} · {group.branchLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pl-3 text-left font-medium">{t('content.editor.name', 'Name')}</th>
                  <th className="py-2 text-left font-medium">{t('content.editor.status', 'Status')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('content.editor.updated', 'Updated')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: BackrefItem) => (
                  <ItemRow key={item.id} item={item} sourceSlug={group.sourceSlug} locale={locale} />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              ←
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              →
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Single item row
// ---------------------------------------------------------------------------

function ItemRow({ item, sourceSlug, locale }: { item: BackrefItem; sourceSlug: string; locale: Locale }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pl-3">
        <Link
          to={`/content/${sourceSlug}/${item.id}`}
          className="flex items-center gap-1 hover:opacity-80 transition-opacity font-medium"
        >
          {item.displayName ?? item.id}
          <ExternalLink className="size-3 text-muted-foreground" />
        </Link>
      </td>
      <td className="py-2">
        <Badge variant={item.status === 'published' ? 'default' : 'secondary'} className="text-xs">
          {item.status}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-right">
        <RelativeTime timestamp={item.updated_at} locale={locale} />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Per-group section
// ---------------------------------------------------------------------------

interface GroupSectionProps {
  group: BackrefGroup
  targetSlug: string
  targetId: string
  locale: Locale
}

function GroupSection({ group, targetSlug, targetId, locale }: GroupSectionProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = React.useState(false)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {group.sourceLabel} · {group.branchLabel}
      </p>
      <table className="w-full text-sm">
        <tbody>
          {group.items.map(item => (
            <ItemRow key={item.id} item={item} sourceSlug={group.sourceSlug} locale={locale} />
          ))}
        </tbody>
      </table>
      {group.total > group.items.length && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          {t('backrefs.showAll', { count: group.total })}
        </Button>
      )}
      {dialogOpen && (
        <GroupDialog
          targetSlug={targetSlug}
          targetId={targetId}
          group={group}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public panel
// ---------------------------------------------------------------------------

export interface ReferencedByPanelProps {
  targetSlug: string
  targetId: string
  /** Called with true when any group has restricts=true */
  onRestrictsChange?: (restricted: boolean) => void
}

export function ReferencedByPanel({ targetSlug, targetId, onRestrictsChange }: ReferencedByPanelProps) {
  const { t } = useTranslation()
  const locale = useLocaleForDate()
  const [open, setOpen] = React.useState(false)
  const { data, isLoading } = useBackrefs(targetSlug, targetId)

  const groups = data?.groups ?? []
  const totalRefs = groups.reduce((acc, g) => acc + g.total, 0)
  const hasRestricts = groups.some(g => g.restricts && g.total > 0)

  // Notify parent whenever restricts status changes
  React.useEffect(() => {
    onRestrictsChange?.(hasRestricts)
  }, [hasRestricts, onRestrictsChange])

  // Hide entirely when no references and not loading
  if (!isLoading && totalRefs === 0) return null

  const summary = totalRefs === 1
    ? t('backrefs.summary_one')
    : t('backrefs.summary_other', { count: totalRefs })

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <span>{t('backrefs.title')}</span>
          {isLoading ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : totalRefs > 0 ? (
            <Badge variant="secondary" className="text-xs">{summary}</Badge>
          ) : null}
        </div>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-4">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : groups.length === 0 ? null : (
            groups.map(group => (
              <GroupSection
                key={`${group.sourceSlug}:${group.branchAlias}`}
                group={group}
                targetSlug={targetSlug}
                targetId={targetId}
                locale={locale}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Delete button with tooltip when restricted
// ---------------------------------------------------------------------------

interface DeleteButtonProps {
  onClick: () => void
  restricted: boolean
  restrictCount: number
  disabled?: boolean
  children: React.ReactNode
}

export function DeleteButtonWithRestrict({
  onClick,
  restricted,
  restrictCount,
  disabled,
  children,
}: DeleteButtonProps) {
  const { t } = useTranslation()

  if (restricted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button variant="destructive" disabled>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t('backrefs.deleteBlocked', { count: restrictCount })}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button variant="destructive" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}
