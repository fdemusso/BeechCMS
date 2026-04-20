import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  Settings, 
  FolderOpen, 
  Layers, 
  Plus, 
  Search, 
  Sun, 
  Moon, 
  FileText,
  ChevronRight
} from "lucide-react"

import { 
  CommandDialog, 
  CommandInput, 
  CommandList, 
  CommandEmpty, 
  CommandGroup, 
  CommandItem, 
  CommandSeparator, 
  CommandShortcut 
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { SEED_REGISTRY, type Seed } from "@beech/core"
import { useCommandPalette } from "./use-command-palette"
import { type CommandPage } from "./types"

export function CommandPalette() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { 
    open, 
    setOpen, 
    pages, 
    currentPage, 
    pushPage, 
    popPage, 
    search, 
    setSearch 
  } = useCommandPalette()

  const seeds = Object.values(SEED_REGISTRY)

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
    setOpen(false)
  }, [theme, setTheme, setOpen])

  const placeholder = React.useMemo(() => {
    switch (currentPage) {
      case "seeds": return "Vai a quale seed?"
      case "create": return "Crea contenuto in quale seed?"
      case "search-results": return "Cerca nei contenuti..."
      default: return "Cerca azioni, contenuti, seed..."
    }
  }, [currentPage])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        [cmdk-list] {
          height: var(--cmdk-list-height);
          transition: height 100ms ease;
        }
      `}} />
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="flex flex-col">
          {pages.length > 1 && (
            <div className="flex items-center gap-2 px-4 pt-4 pb-0 overflow-x-auto no-scrollbar">
              {pages.map((page, i) => (
                <React.Fragment key={i}>
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-secondary/80 capitalize shrink-0"
                    onClick={() => {
                      // Pop back to this index
                      const diff = pages.length - 1 - i
                      for (let j = 0; j < diff; j++) popPage()
                    }}
                  >
                    {page}
                  </Badge>
                  {i < pages.length - 1 && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          )}
          <CommandInput 
            placeholder={placeholder} 
            value={search} 
            onValueChange={setSearch} 
          />
        </div>
        <CommandList className="max-h-[400px] scroll-padding-2">
          <CommandEmpty>
            {currentPage === "search-results" && search.length < 2 
              ? "Digita almeno 2 caratteri"
              : `Nessun risultato per "${search}"`}
          </CommandEmpty>
          
          {currentPage === "root" && (
            <RootView 
              seeds={seeds} 
              pushPage={pushPage} 
              navigate={navigate} 
              setOpen={setOpen}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          )}

          {currentPage === "seeds" && (
            <SeedsView 
              seeds={seeds} 
              navigate={navigate} 
              setOpen={setOpen} 
              type="navigate"
            />
          )}

          {currentPage === "create" && (
            <SeedsView 
              seeds={seeds} 
              navigate={navigate} 
              setOpen={setOpen} 
              type="create"
            />
          )}

          {currentPage === "search-results" && (
            <SearchResultsView 
              search={search} 
              seeds={seeds} 
              navigate={navigate} 
              setOpen={setOpen} 
            />
          )}
        </CommandList>
        {(currentPage !== "root") && (
          <div className="p-3 border-t text-[10px] text-muted-foreground bg-muted/20">
            ← Backspace per tornare
          </div>
        )}
      </CommandDialog>
    </>
  )
}

interface RootViewProps {
  seeds: Seed[]
  pushPage: (page: CommandPage) => void
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
  theme: string | undefined
  toggleTheme: () => void
}

function RootView({ seeds, pushPage, navigate, setOpen, theme, toggleTheme }: RootViewProps) {
  return (
    <>
      <CommandGroup heading="Naviga" forceMount>
        <CommandItem onSelect={() => { navigate("/"); setOpen(false) }}>
          <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
          <span>Dashboard</span>
        </CommandItem>
        <CommandItem onSelect={() => { navigate("/media"); setOpen(false) }}>
          <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>Media Library</span>
        </CommandItem>
        <CommandItem onSelect={() => { navigate("/settings"); setOpen(false) }}>
          <Settings className="size-4 shrink-0 text-muted-foreground" />
          <span>Impostazioni</span>
        </CommandItem>
      </CommandGroup>
      
      <CommandSeparator />
      
      <CommandGroup heading="Contenuti">
        {seeds.slice(0, 5).map((seed: any) => (
          <CommandItem 
            key={seed.slug} 
            onSelect={() => { navigate(`/content/${seed.slug}`); setOpen(false) }}
            keywords={[seed.slug, "contenuto", "lista"]}
          >
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            <span>Vai a {seed.label}...</span>
          </CommandItem>
        ))}
        {seeds.length > 5 && (
          <CommandItem onSelect={() => pushPage("seeds")}>
            <Layers className="size-4 shrink-0 text-muted-foreground" />
            <span>Tutti i seed...</span>
          </CommandItem>
        )}
      </CommandGroup>

      <CommandGroup heading="Crea">
        <CommandItem onSelect={() => pushPage("create")}>
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span>Nuovo contenuto...</span>
          <CommandShortcut>
            <kbd className="text-xs font-mono bg-muted px-1 rounded">⌘</kbd> 
            <kbd className="text-xs font-mono bg-muted px-1 rounded ml-1">N</kbd>
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <CommandGroup heading="Strumenti">
        <CommandItem onSelect={() => pushPage("search-results")}>
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span>Cerca nei contenuti...</span>
          <CommandShortcut>
            <kbd className="text-xs font-mono bg-muted px-1 rounded">⌘</kbd> 
            <kbd className="text-xs font-mono bg-muted px-1 rounded ml-1">F</kbd>
          </CommandShortcut>
        </CommandItem>
        <CommandItem onSelect={toggleTheme} keywords={["dark mode", "light mode", "tema", "theme"]}>
          {theme === "dark" ? <Sun className="size-4 shrink-0 text-muted-foreground" /> : <Moon className="size-4 shrink-0 text-muted-foreground" />}
          <span>Cambia tema</span>
        </CommandItem>
      </CommandGroup>
    </>
  )
}

interface SeedsViewProps {
  seeds: Seed[]
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
  type: "navigate" | "create"
}

function SeedsView({ seeds, navigate, setOpen, type }: SeedsViewProps) {
  return (
    <CommandGroup heading={type === "create" ? "Crea in..." : "Scegli Seed"}>
      {seeds.map((seed: any) => (
        <CommandItem 
          key={seed.slug} 
          onSelect={() => { 
            navigate(type === "create" ? `/content/${seed.slug}/create` : `/content/${seed.slug}`)
            setOpen(false) 
          }}
        >
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span>{seed.label}</span>
            <span className="text-[10px] text-muted-foreground">{seed.slug}</span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

interface SearchResultsViewProps {
  search: string
  seeds: Seed[]
  navigate: (path: string) => void
  setOpen: (open: boolean) => void
}

function SearchResultsView({ search, seeds, navigate, setOpen }: SearchResultsViewProps) {
  // TODO: Se un endpoint globale non esiste, cercare nei primi 3 seed e unire i risultati
  const { data: results, isLoading } = useQuery({
    queryKey: ["cmd-search", search],
    queryFn: async () => {
      // In assenza di un endpoint globale ottimizzato, interroghiamo i primi 3 seed
      const topSeeds = seeds.slice(0, 3)
      const requests = topSeeds.map((seed: any) => 
        fetch(`/api/content/${seed.slug}?search=${search}&limit=3`)
          .then(r => r.json())
          .then(data => (data.entries || []).map((e: any) => ({ ...e, schema_slug: seed.slug })))
      )
      const nestedResults = await Promise.all(requests)
      return nestedResults.flat().slice(0, 8)
    },
    enabled: search.length >= 2,
    staleTime: 30_000
  })

  if (search.length < 2) return null

  return (
    <>
      {isLoading && <div className="px-4 py-6 text-sm text-center text-muted-foreground">Ricerca in corso...</div>}
      <CommandGroup heading="Risultati della ricerca">
        {results?.map((entry: any) => {
          // Entry model typically has data property with fields
          const title = Object.values(entry.data || {})[0] || entry.id
          return (
            <CommandItem 
              key={entry.id} 
              onSelect={() => { 
                navigate(`/content/${entry.schema_slug}/${entry.id}`)
                setOpen(false) 
              }}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span>{String(title)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {entry.schema_slug} · {entry.status || "draft"}
                </span>
              </div>
            </CommandItem>
          )
        })}
      </CommandGroup>
    </>
  )
}
