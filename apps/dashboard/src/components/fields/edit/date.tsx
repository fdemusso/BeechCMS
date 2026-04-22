import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FieldEditProps } from "../types"

function parseDateValue(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toStorageDate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function DateEdit({ branch, value, onChange }: FieldEditProps) {
  const dateValue = React.useMemo(() => parseDateValue(value), [value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={branch.alias}
          variant="outline"
          data-empty={!dateValue}
          className={cn(
            "w-full justify-start text-left font-normal",
            "data-[empty=true]:text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-4" />
          {dateValue ? format(dateValue, "PPP") : <span>Seleziona una data</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={(date) => onChange(date ? toStorageDate(date) : "")}
        />
      </PopoverContent>
    </Popover>
  )
}
