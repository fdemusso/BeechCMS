import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WidgetErrorProps {
  message?: string
  onRetry?: () => void
}

export function WidgetError({ message = "Errore nel caricamento", onRetry }: WidgetErrorProps) {
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="size-8 text-destructive/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Riprova
        </Button>
      )}
    </div>
  )
}
