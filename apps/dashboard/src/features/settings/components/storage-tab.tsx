// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  SETTINGS_TABLE_HEAD_REM,
  SETTINGS_TABLE_ROW_CLASS,
  SETTINGS_TABLE_ROW_REM,
  SettingsReadout,
  SettingsReadouts,
  SettingsRow,
  SettingsScroll,
  SettingsSection,
} from '@/components/ui/settings-section'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useDeleteOrphans, useStorageStats } from '../hooks/use-settings'

/** The allowance as a whole number of GB: it is a round figure of the plan, not a measurement. */
function formatAllowance(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/svg+xml': 'SVG',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4',
}

function mimeLabel(mime: string): string {
  return MIME_LABELS[mime] ?? mime.split('/')[1]?.toUpperCase() ?? 'File'
}

/**
 * Storage: how much space the uploaded files take (read-only facts), and the files nobody uses any more (orphans),
 * which can be reviewed and removed a page at a time. The orphans are a table, five rows visible, the rest scrolls.
 */
export function StorageTab() {
  const { t } = useTranslation()
  const [offset, setOffset] = useState(0)
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  const { data: stats, isLoading, isError } = useStorageStats(offset)
  const deleteOrphans = useDeleteOrphans()

  // Selection is per page: the server accepts at most one page of keys.
  const goToOffset = (nextOffset: number) => {
    setSelectedKeys(new Set())
    setOffset(nextOffset)
  }

  const toggleKey = (key: string) => {
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedKeys(next)
  }

  const handleDelete = () => {
    deleteOrphans.mutate([...selectedKeys], {
      onSuccess: () => {
        toast.success(t('settings.storage.deleted', { count: selectedKeys.size }))
        // Only an emptied last page needs a step back; on an earlier page the next orphans slide into this offset.
        const pageEmptied =
          stats !== undefined &&
          selectedKeys.size === stats.orphans.length &&
          offset + stats.orphans.length >= stats.orphanTotal
        goToOffset(pageEmptied ? Math.max(0, offset - stats.orphanLimit) : offset)
      },
      onError: () => {
        toast.error(t('settings.storage.deleteFailed'))
        setSelectedKeys(new Set())
      },
    })
  }

  if (isLoading) {
    return (
      <div role="status" className="space-y-6">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }

  if (isError) {
    return <p role="alert">{t('settings.storage.loadFailed')}</p>
  }

  // R2 has no capacity to ask for: the meter is read against the free allowance the API reports.
  const limitBytes = stats?.limitBytes ?? 0
  const allowance = formatAllowance(limitBytes)
  const usagePercent = limitBytes > 0 ? Math.min(100, ((stats?.totalBytes ?? 0) / limitBytes) * 100) : 0

  return (
    <div className="space-y-10">
      <SettingsSection id="usage" title={t('settings.storage.usageTitle')} description={t('settings.storage.usageDesc')}>
        <SettingsReadouts>
          <SettingsReadout label={t('settings.storage.usedLabel')}>
            <span className="text-2xl font-medium tabular-nums">{formatBytes(stats?.totalBytes ?? 0)}</span>
          </SettingsReadout>
          <SettingsReadout label={t('settings.storage.filesLabel')}>
            {t('settings.storage.fileCount', { count: stats?.fileCount ?? 0 })}
          </SettingsReadout>
          {stats?.orphanTotal ? (
            <SettingsReadout label={t('settings.storage.orphansLabel')}>
              <Badge variant="secondary">
                {t('settings.storage.orphanCount', { count: stats.orphanTotal })} · {formatBytes(stats.orphanBytes)}
              </Badge>
            </SettingsReadout>
          ) : null}
        </SettingsReadouts>
        <SettingsRow
          label={t('settings.storage.progressLabel', { limit: allowance })}
          description={t('settings.storage.referenceVisual', { limit: allowance })}
        >
          <div className="flex items-center gap-3">
            <Progress value={usagePercent} className="h-2" aria-label={t('settings.storage.progressLabel', { limit: allowance })} />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{usagePercent.toFixed(1)}%</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="orphans" title={t('settings.storage.orphansTitle')} description={t('settings.storage.orphansDesc')}>
        {!stats?.orphanTotal ? (
          <p className="border-b border-border py-4 text-sm text-muted-foreground">{t('settings.storage.noOrphans')}</p>
        ) : (
          <SettingsScroll label={t('settings.storage.orphansListLabel')} rowRem={SETTINGS_TABLE_ROW_REM} headerRem={SETTINGS_TABLE_HEAD_REM}>
            {/* The table must not scroll on its own, or the header could not stay above the rows. */}
            <Table containerClassName="overflow-visible" aria-label={t('settings.storage.orphansListLabel')}>
              <TableHeader className="sticky top-0 z-10 bg-[var(--settings-page-bg)]">
                <TableRow>
                  <TableHead className="w-10"><span className="sr-only">{t('settings.storage.selectColumn')}</span></TableHead>
                  <TableHead>{t('settings.storage.fileColumn')}</TableHead>
                  <TableHead>{t('settings.storage.typeColumn')}</TableHead>
                  <TableHead className="text-right">{t('settings.storage.sizeColumn')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.orphans.map(file => (
                  <TableRow key={file.key} className={SETTINGS_TABLE_ROW_CLASS}>
                    <TableCell>
                      <Checkbox
                        checked={selectedKeys.has(file.key)}
                        onCheckedChange={() => toggleKey(file.key)}
                        aria-label={t('settings.storage.selectOrphan', { filename: file.filename })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <p className="truncate text-sm font-medium">{file.filename}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{file.key}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline">{mimeLabel(file.mime_type)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(file.size_bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsScroll>
        )}

        {selectedKeys.size > 0 && (
          <div className="flex justify-end pt-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={deleteOrphans.isPending}>
                  {t('settings.storage.deleteSelected', { count: selectedKeys.size })}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settings.storage.deleteTitle', { count: selectedKeys.size })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('settings.storage.deleteDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleteOrphans.isPending}>{t('common.delete')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {stats && (stats.orphanTotal > stats.orphanLimit || offset > 0) && (
          <nav aria-label={t('settings.storage.pagesLabel')} className="flex items-center justify-between gap-3 pt-4">
            <Button type="button" variant="outline" disabled={offset === 0} onClick={() => goToOffset(Math.max(0, offset - stats.orphanLimit))}>
              {t('common.previous')}
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {t('settings.storage.pageRange', { start: offset + 1, end: Math.min(offset + stats.orphans.length, stats.orphanTotal), total: stats.orphanTotal })}
            </span>
            <Button type="button" variant="outline" disabled={offset + stats.orphanLimit >= stats.orphanTotal} onClick={() => goToOffset(offset + stats.orphanLimit)}>
              {t('common.next')}
            </Button>
          </nav>
        )}
      </SettingsSection>
    </div>
  )
}
