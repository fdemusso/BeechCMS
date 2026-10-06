// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { FileRemove as FileX } from 'reicon-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
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
import { toast } from 'sonner'
import { useDeleteOrphans, useStorageStats } from '../hooks/use-settings'

const REFERENCE_BYTES = 1 * 1024 * 1024 * 1024

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
        // An emptied last page would otherwise render no rows.
        const pageEmptied = stats !== undefined && selectedKeys.size === stats.orphans.length
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
      <div className="space-y-6">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const usagePercent = Math.min(100, ((stats?.totalBytes ?? 0) / REFERENCE_BYTES) * 100)

  if (isError) {
    return <p role="alert">{t('settings.storage.loadFailed')}</p>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.storage.usageTitle')}</CardTitle>
          <CardDescription>{t('settings.storage.usageDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tabular-nums">{formatBytes(stats?.totalBytes ?? 0)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.storage.fileCount', { count: stats?.fileCount ?? 0 })}
              </p>
            </div>
            {stats?.orphanTotal ? (
              <Badge variant="secondary" className="mb-1">
                {t('settings.storage.orphanCount', { count: stats.orphanTotal })} · {formatBytes(stats.orphanBytes)}
              </Badge>
            ) : null}
          </div>
          <Progress value={usagePercent} className="h-2" />
          <p className="text-xs text-muted-foreground">{t('settings.storage.referenceVisual')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileX className="size-4" />
            {t('settings.storage.orphansTitle')}
          </CardTitle>
          <CardDescription>{t('settings.storage.orphansDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!stats?.orphanTotal ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('settings.storage.noOrphans')}
            </p>
          ) : (
            <ScrollArea className="h-72">
              <div className="space-y-0">
                {stats.orphans.map(file => (
                  <div key={file.key} className="flex items-center justify-between py-3 border-b last:border-0">
                    <Checkbox
                      className="mr-3"
                      checked={selectedKeys.has(file.key)}
                      onCheckedChange={() => toggleKey(file.key)}
                      aria-label={t('settings.storage.selectOrphan', { filename: file.filename })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground font-mono">{file.key}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <Badge variant="outline">{mimeLabel(file.mime_type)}</Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(file.size_bytes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
                    <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {stats && stats.orphanTotal > stats.orphanLimit && (
            <div className="flex items-center justify-between gap-3 pt-4">
              <Button type="button" variant="outline" disabled={offset === 0} onClick={() => goToOffset(Math.max(0, offset - stats.orphanLimit))}>
                {t('common.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('settings.storage.pageRange', { start: offset + 1, end: Math.min(offset + stats.orphans.length, stats.orphanTotal), total: stats.orphanTotal })}
              </span>
              <Button type="button" variant="outline" disabled={offset + stats.orphanLimit >= stats.orphanTotal} onClick={() => goToOffset(offset + stats.orphanLimit)}>
                {t('common.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
