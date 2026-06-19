// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, ArrowRight } from "lucide-react"

export function AIInsights() {
  return (
    <Card className="relative overflow-hidden border border-border bg-card">
      {/* Decorative background element */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
      
      <CardHeader className="relative flex flex-row items-center justify-between pb-2 text-foreground">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Beech AI Insights
        </CardTitle>
      </CardHeader>
      
      <CardContent className="relative space-y-4 text-foreground">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ho notato che hai creato molti contenuti nella categoria <span className="font-semibold text-foreground">"Blog"</span> ma pochi hanno una meta description ottimizzata per la SEO.
        </p>
        
        <div className="rounded-xl bg-background/50 p-3 text-sm">
          <p className="font-medium">Suggerimento:</p>
          <p className="text-muted-foreground">Posso generare automaticamente delle descrizioni SEO per i tuoi ultimi 5 articoli.</p>
        </div>
        
        <button className="group flex items-center gap-1 text-sm font-semibold text-foreground hover:underline transition-all hover:gap-2">
          Ottimizza ora
          <ArrowRight className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  )
}
