import { useTranslation } from "react-i18next"
import { FileText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import type { Seed } from "@beech/core"

import { api } from "@/lib/api"

interface SearchResultItem {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  title: string
  excerpt: string
  data: Record<string, unknown>
}

interface SearchResponse {
  items: SearchResultItem[]
  nextCursor: string | null
  total: number
}

interface SearchResultsViewProps {
  search: string
  seeds: Seed[]
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
}

export function SearchResultsView({
  search,
  navigate,
  setOpen,
}: SearchResultsViewProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ["cmd-search", search] as const,
    queryFn: async (): Promise<SearchResponse> => {
      console.log("[CommandPalette] Global search for:", search);
      const res = await api.get<SearchResponse>(
        `/search?q=${encodeURIComponent(search)}&limit=8`
      )
      return res.data
    },
    enabled: search.length >= 2,
    staleTime: 30_000,
  })

  const results = data?.items ?? []

  if (search.length < 2) return null

  if (isLoading) {
    return (
      <div className="px-4 py-6 text-sm text-center text-muted-foreground">
        {t("commandPalette.searching")}
      </div>
    )
  }

  return (
    <CommandGroup heading={t("commandPalette.searchResults")}>
      {results.map((entry) => (
        <CommandItem
          key={entry.id}
          onSelect={() => {
            navigate(`/content/${entry.schema_slug}/${entry.id}`)
            setOpen(false)
          }}
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">{entry.title}</span>
            {entry.excerpt && (
              <span
                className="text-xs text-muted-foreground line-clamp-1"
                dangerouslySetInnerHTML={{ __html: entry.excerpt }}
              />
            )}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {entry.schema_slug} · {entry.status}
            </span>
          </div>
        </CommandItem>
      ))}
      {results.length === 0 && !isLoading && (
        <div className="px-4 py-6 text-sm text-center text-muted-foreground">
          {t("commandPalette.noSearchResults")}
        </div>
      )}
    </CommandGroup>
  )
}
