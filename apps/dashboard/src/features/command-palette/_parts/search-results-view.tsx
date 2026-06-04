// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { FileText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import type { Seed } from "@beechcms/core"

import { api } from "@/lib/api"
import { useDebounce } from "@/hooks/use-debounce"

function renderExcerpt(raw: string): React.ReactNode[] {
  const cleaned = raw.replace(/<(?!\/?mark\b)[^>]*>/gi, '')
  const parts = cleaned.split(/(<mark>|<\/mark>)/gi)
  const nodes: React.ReactNode[] = []
  let inMark = false
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.toLowerCase() === '<mark>') { inMark = true; continue }
    if (part.toLowerCase() === '</mark>') { inMark = false; continue }
    if (part) nodes.push(inMark ? <mark key={i}>{part}</mark> : part)
  }
  return nodes
}

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
  const debouncedSearch = useDebounce(search, 300)
  const { data, isLoading } = useQuery({
    queryKey: ["cmd-search", debouncedSearch] as const,
    queryFn: async (): Promise<SearchResponse> => {
      const res = await api.get<SearchResponse>(
        `/search?q=${encodeURIComponent(debouncedSearch)}&limit=8`
      )
      return res.data
    },
    enabled: debouncedSearch.length >= 2,
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
              <span className="text-xs text-muted-foreground line-clamp-1">
                {renderExcerpt(entry.excerpt)}
              </span>
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
