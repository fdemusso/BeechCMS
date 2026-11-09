// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PlusCircle, Image as ImageIcon, Settings, Grid as LayoutGrid } from '@/components/icons'

interface QuickActionsProps {
  onAction: (action: string) => void
}

export function QuickActions({ onAction }: QuickActionsProps) {
  const actions = [
    { id: 'new-entry', label: 'Nuovo Contenuto', icon: PlusCircle, color: 'text-muted-foreground' },
    { id: 'media', label: 'Carica Media', icon: ImageIcon, color: 'text-muted-foreground' },
    { id: 'collections', label: 'Gestisci Collezioni', icon: LayoutGrid, color: 'text-muted-foreground' },
    { id: 'settings', label: 'Configurazione', icon: Settings, color: 'text-muted-foreground' },
  ]

  return (
    <Card className="border-none bg-background/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Azioni Rapide</CardTitle>
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
