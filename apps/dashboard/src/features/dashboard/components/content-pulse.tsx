import { useContentBreakdown } from "../hooks/use-dashboard-stats"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Activity, LayoutGrid } from "lucide-react"
import { Link } from "react-router-dom"

export function ContentPulse() {
  const { data: breakdown = [], isLoading } = useContentBreakdown()

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-none bg-white/50 backdrop-blur-xl dark:bg-neutral-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Content Pulse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Ordina per quantità decrescente (i più pieni prima)
  const sortedBreakdown = [...breakdown].sort((a, b) => b.count - a.count)
  const totalCount = sortedBreakdown.reduce((acc, curr) => acc + curr.count, 0)

  return (
    <Card className="overflow-hidden border-none bg-white/50 backdrop-blur-xl dark:bg-neutral-900/50 shadow-sm transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="size-4 text-emerald-500" />
          Content Pulse
        </CardTitle>
        <LayoutGrid className="size-4 text-neutral-400" />
      </CardHeader>
      <CardContent className="">
        <ScrollArea className="h-[260px] pr-4">
          <div className="space-y-5">
            {sortedBreakdown.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-4">Nessun contenuto trovato.</p>
            ) : (
              sortedBreakdown.map((item) => {
                const percentage = totalCount > 0 ? (item.count / totalCount) * 100 : 0
                return (
                  <div key={item.slug} className="group space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <Link 
                        to={`/content/${item.slug}`} 
                        className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                      >
                        {item.label}
                      </Link>
                      <span className="text-neutral-500 tabular-nums">{item.count} entries</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress 
                        value={percentage} 
                        className="h-1.5 flex-1" 
                        indicatorClassName="bg-emerald-500/80 dark:bg-emerald-400/80"
                      />
                      <span className="text-[10px] text-neutral-400 w-8 text-right font-mono">
                        {Math.round(percentage)}%
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
        
        <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
          <span className="text-[10px] text-neutral-400 uppercase tracking-tighter font-bold">Distribuzione Totale</span>
          <span className="text-[10px] font-mono font-bold text-neutral-500">{totalCount} items</span>
        </div>
      </CardContent>
    </Card>
  )
}
