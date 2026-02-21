import * as React from "react"
import type { Seed } from "@beech/core"
import type { ContentEntry } from "@/lib/dynamic-columns"

import { FieldEdit } from "@/components/fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

  /** Aggiorna il valore del campo nel form; usato da FieldEdit onChange */
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
                <FieldEdit
                  branch={branch}
                  value={formData[branch.alias]}
                  onChange={(val) => handleInputChange(branch.alias, val)}
                />
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
