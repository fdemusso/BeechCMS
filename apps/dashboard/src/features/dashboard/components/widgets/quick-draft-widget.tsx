import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { CheckCircle2 } from "lucide-react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DashboardWidgetShell } from "@/features/dashboard"
import { cn } from "@/lib/utils"

export interface QuickDraftWidgetProps {
  seeds: Array<{ slug: string; label: string }>
  variant?: "minimal" | "expanded"
  title?: string
  placeholder?: string
  onCreated?: (id: string, seedSlug: string) => void
}

function toKebab(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export function QuickDraftWidget({ 
  seeds, 
  variant = "minimal", 
  title: customTitle,
  placeholder: customPlaceholder,
  onCreated 
}: QuickDraftWidgetProps) {
  const [title, setTitle] = useState("")
  const [selectedSeed, setSelectedSeed] = useState(seeds[0]?.slug ?? "")
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ id: string }>(`/content/${selectedSeed}`, {
        status: "draft",
        title: title,
      })
      return { id: res.data.id, seedSlug: selectedSeed }
    },
    onSuccess: ({ id, seedSlug }) => {
      queryClient.invalidateQueries({ queryKey: ["content", seedSlug] })
      queryClient.invalidateQueries({ queryKey: ["widget", "recent-content", seedSlug] })
      queryClient.invalidateQueries({ queryKey: ["widget", "pending-drafts", seedSlug] })
      onCreated?.(id, seedSlug)
      setSuccess(true)
      setTimeout(() => {
        navigate(`/content/${seedSlug}/${id}`)
      }, 800)
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Errore nella creazione")
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    if (!title.trim() || !selectedSeed) return
    mutate()
  }

  if (success) {
    return (
      <DashboardWidgetShell>
        <div className="flex h-full items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          <span className="text-sm font-medium">Bozza creata</span>
        </div>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell>
      <form onSubmit={handleSubmit} className="space-y-3">
        {variant === "expanded" && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {customTitle || "Crea bozza rapida"}
          </p>
        )}
        <div className={cn("flex gap-2", variant === "expanded" ? "flex-col" : "flex-row items-center")}>
          <div className="flex-1 space-y-1">
            {variant === "expanded" && <label className="text-xs text-muted-foreground">Titolo</label>}
            <Input
              placeholder={customPlaceholder || "Titolo del contenuto"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
            {variant === "expanded" && title && (
              <p className="text-xs text-muted-foreground font-mono">/{toKebab(title)}</p>
            )}
          </div>
          <div className={cn(variant === "expanded" ? "w-full space-y-1" : "w-32 shrink-0")}>
            {variant === "expanded" && <label className="text-xs text-muted-foreground">Tipo</label>}
            <Select value={selectedSeed} onValueChange={setSelectedSeed}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {seeds.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {variant === "minimal" && (
            <Button type="submit" size="sm" disabled={isPending || !title.trim()} className="shrink-0 h-8">
              {isPending ? "..." : "Crea"}
            </Button>
          )}
        </div>
        {variant === "expanded" && (
          <Button type="submit" size="sm" disabled={isPending || !title.trim()} className="w-full h-8">
            {isPending ? "Creazione..." : "Crea bozza"}
          </Button>
        )}
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      </form>
    </DashboardWidgetShell>
  )
}
