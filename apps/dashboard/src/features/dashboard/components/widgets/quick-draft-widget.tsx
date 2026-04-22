import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, FilePlus } from "lucide-react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DashboardWidgetShell } from "@/features/dashboard"
import { cn } from "@/lib/utils"

export interface QuickDraftSeedOption {
  slug: string
  label: string
  /** Alias del branch che funge da nome leggibile dell'entry (es. "title", "name", "author") */
  displayNameAlias: string
  /** Etichetta da mostrare nel campo di input (es. "Titolo", "Nome", "Autore") */
  displayNameLabel: string
}

export interface QuickDraftWidgetProps {
  seeds: Array<QuickDraftSeedOption>
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

  const selectedSeedOption = seeds.find(s => s.slug === selectedSeed)
  const nameAlias = selectedSeedOption?.displayNameAlias ?? "title"
  const nameLabel = selectedSeedOption?.displayNameLabel ?? nameAlias

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ id: string }>(`/content/${selectedSeed}`, {
        status: "draft",
        [nameAlias]: title,
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
          <span className="text-sm font-semibold">Bozza creata!</span>
        </div>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell icon={FilePlus} title={variant === "minimal" ? (customTitle || "Nuova bozza") : undefined}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {variant === "expanded" && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {customTitle || "Crea bozza rapida"}
          </p>
        )}
        {/* Minimal variant: on mobile stack input+select on first row, button full-width below.
            On sm+: single row as designed.
            Expanded variant: always stacked vertically. */}
        <div className={cn(
          "flex gap-2",
          variant === "expanded"
            ? "flex-col"
            : "flex-col sm:flex-row sm:items-center"
        )}>
          <div className="flex-1 space-y-1">
            {variant === "expanded" && <label className="text-xs text-muted-foreground">{nameLabel}</label>}
            <Input
              placeholder={customPlaceholder || `${nameLabel}…`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
            {variant === "expanded" && title && (
              <p className="text-xs text-muted-foreground font-mono">/{toKebab(title)}</p>
            )}
          </div>
          {/* On mobile (minimal): select + button side by side below the input */}
          <div className={cn(
            "flex gap-2",
            variant === "minimal" ? "items-center sm:contents" : ""
          )}>
            <div className={cn(
              variant === "expanded" ? "w-full space-y-1" : "flex-1 min-w-0 sm:w-28 sm:shrink-0 sm:flex-none"
            )}>
              {variant === "expanded" && <label className="text-xs text-muted-foreground">Tipo</label>}
              <Select value={selectedSeed} onValueChange={setSelectedSeed}>
                <SelectTrigger className="h-8 text-sm w-full overflow-hidden">
                  <span className="truncate block">{seeds.find(s => s.slug === selectedSeed)?.label ?? "Tipo"}</span>
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
                {isPending ? "…" : "Crea"}
              </Button>
            )}
          </div>
        </div>
        {variant === "expanded" && (
          <Button type="submit" size="sm" disabled={isPending || !title.trim()} className="w-full h-8">
            {isPending ? "Creazione…" : "Crea bozza"}
          </Button>
        )}
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      </form>
    </DashboardWidgetShell>
  )
}
