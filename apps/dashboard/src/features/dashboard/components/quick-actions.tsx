import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PlusCircle, ImageIcon, Settings, LayoutGrid } from "lucide-react"

interface QuickActionsProps {
  onAction: (action: string) => void
}

export function QuickActions({ onAction }: QuickActionsProps) {
  const actions = [
    { id: 'new-entry', label: 'Nuovo Contenuto', icon: PlusCircle, color: 'text-emerald-500' },
    { id: 'media', label: 'Carica Media', icon: ImageIcon, color: 'text-blue-500' },
    { id: 'collections', label: 'Gestisci Collezioni', icon: LayoutGrid, color: 'text-amber-500' },
    { id: 'settings', label: 'Configurazione', icon: Settings, color: 'text-slate-500' },
  ]

  return (
    <Card className="border-none bg-background/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Azioni Rapide</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            className="flex h-24 flex-col items-center justify-center gap-2 border-none bg-background/40 transition-all hover:bg-background/80 hover:scale-105"
            onClick={() => onAction(action.id)}
          >
            <action.icon className={`h-6 w-6 ${action.color}`} />
            <span className="text-xs font-medium">{action.label}</span>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
