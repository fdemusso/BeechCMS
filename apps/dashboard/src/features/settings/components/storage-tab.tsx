import { Loader2, FileX } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStorageStats } from '../hooks/use-settings'

const REFERENCE_BYTES = 1 * 1024 * 1024 * 1024 // 1 GB come riferimento visivo

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
  const { data: stats, isLoading } = useStorageStats()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const usagePercent = Math.min(100, ((stats?.totalBytes ?? 0) / REFERENCE_BYTES) * 100)
  const orphanBytes = stats?.orphans.reduce((acc, f) => acc + f.size_bytes, 0) ?? 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Utilizzo storage</CardTitle>
          <CardDescription>Spazio occupato dai file caricati su R2.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tabular-nums">{formatBytes(stats?.totalBytes ?? 0)}</p>
              <p className="text-sm text-muted-foreground mt-1">{stats?.fileCount ?? 0} file totali</p>
            </div>
            {stats?.orphans.length ? (
              <Badge variant="secondary" className="mb-1">
                {stats.orphans.length} orfani · {formatBytes(orphanBytes)}
              </Badge>
            ) : null}
          </div>
          <Progress value={usagePercent} className="h-2" />
          <p className="text-xs text-muted-foreground">Riferimento visivo: 1 GB</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileX className="size-4" />
            File orfani
          </CardTitle>
          <CardDescription>
            File caricati ma non referenziati da nessun contenuto. Possono essere eliminati manualmente da Cloudflare R2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stats?.orphans.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun file orfano trovato</p>
          ) : (
            <ScrollArea className="h-72">
              <div className="space-y-0">
                {stats.orphans.map(file => (
                  <div key={file.key} className="flex items-center justify-between py-3 border-b last:border-0">
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
        </CardContent>
      </Card>
    </div>
  )
}
