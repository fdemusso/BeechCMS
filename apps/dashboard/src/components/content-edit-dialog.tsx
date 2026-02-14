import * as React from "react"
import type { Seed } from "@beech/core"
import type { ContentEntry } from "@/lib/dynamic-columns"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Props per il dialog di creazione/modifica contenuto.
 * @property open - Stato apertura dialog
 * @property onOpenChange - Callback per cambiare stato
 * @property seed - Seed dello schema (definisce i campi)
 * @property entry - Entry esistente (modifica) o null (creazione)
 * @property onSave - Callback al salvataggio con i dati del form
 */
interface ContentEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  entry: ContentEntry | null
  onSave: (data: Record<string, unknown>) => Promise<void>
}

export function ContentEditDialog({
  open,
  onOpenChange,
  seed,
  entry,
  onSave,
}: ContentEditDialogProps) {
  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Popola il form quando il dialog si apre o l'entry cambia
  React.useEffect(() => {
    if (open) {
      if (entry) {
        // Modalità modifica: popola con i dati esistenti
        setFormData(entry.data)
      } else {
        // Modalità creazione: inizializza vuoto
        const initialData: Record<string, unknown> = {}
        seed.branches.forEach((branch) => {
          if (branch.type === "boolean") {
            initialData[branch.alias] = false
          } else {
            initialData[branch.alias] = ""
          }
        })
        setFormData(initialData)
      }
      setError(null)
    }
  }, [open, entry, seed])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      // Validazione e parsing JSON
      const processedData: Record<string, unknown> = {}
      
      for (const branch of seed.branches) {
        if (branch.type === "json" && formData[branch.alias]) {
          try {
            // Se è una stringa, parsala; altrimenti mantienila così
            const value = formData[branch.alias]
            if (typeof value === "string") {
              processedData[branch.alias] = JSON.parse(value)
            } else {
              processedData[branch.alias] = value
            }
          } catch {
            setError(`Il campo "${branch.label}" deve contenere JSON valido`)
            setIsSaving(false)
            return
          }
        } else {
          processedData[branch.alias] = formData[branch.alias]
        }
      }

      await onSave(processedData)
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante il salvataggio"
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleInputChange = (alias: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [alias]: value,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Modifica" : "Crea nuovo"} {seed.label}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? "Modifica i campi e clicca Salva per aggiornare."
              : "Compila i campi e clicca Crea per aggiungere una nuova entry."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {seed.branches.map((branch) => (
              <div key={branch.id} className="grid gap-2">
                <Label htmlFor={branch.alias}>{branch.label}</Label>
                {branch.type === "text" && (
                  <Input
                    id={branch.alias}
                    type="text"
                    value={(formData[branch.alias] as string) || ""}
                    onChange={(e) =>
                      handleInputChange(branch.alias, e.target.value)
                    }
                  />
                )}
                {branch.type === "number" && (
                  <Input
                    id={branch.alias}
                    type="number"
                    step="any"
                    value={(formData[branch.alias] as number) || ""}
                    onChange={(e) =>
                      handleInputChange(
                        branch.alias,
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                  />
                )}
                {branch.type === "boolean" && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={branch.alias}
                      checked={
                        formData[branch.alias] === true ||
                        formData[branch.alias] === "true"
                      }
                      onCheckedChange={(checked) =>
                        handleInputChange(branch.alias, checked === true)
                      }
                    />
                    <label
                      htmlFor={branch.alias}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {branch.label}
                    </label>
                  </div>
                )}
                {branch.type === "date" && (
                  <Input
                    id={branch.alias}
                    type="date"
                    value={
                      formData[branch.alias]
                        ? new Date(formData[branch.alias] as string)
                            .toISOString()
                            .split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      handleInputChange(branch.alias, e.target.value)
                    }
                  />
                )}
                {branch.type === "json" && (
                  <div>
                    <textarea
                      id={branch.alias}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={
                        typeof formData[branch.alias] === "string"
                          ? (formData[branch.alias] as string)
                          : JSON.stringify(formData[branch.alias], null, 2)
                      }
                      onChange={(e) =>
                        handleInputChange(branch.alias, e.target.value)
                      }
                      placeholder={
                        branch.alias.toLowerCase().includes("tag")
                          ? '{"cms": "#3b82f6", "react": "#06b6d4", "typescript": "#8b5cf6"}'
                          : '{"key": "value"}'
                      }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {branch.alias.toLowerCase().includes("tag")
                        ? 'Oggetto tag→colore, es: {"cms": "blue", "react": "green"}'
                        : 'Oggetto JSON, es: {"client": "Nome"}'}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvataggio..." : entry ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
