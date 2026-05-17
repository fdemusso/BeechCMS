import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"
import type { FieldEditProps } from "../types"

export function NumberStepper({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const displayValue = raw !== undefined && raw !== null ? raw : ""
  const opts = branch.numberOptions
  
  const min = opts?.min
  const max = opts?.max
  const step = opts?.step ?? 1

  const handleDecrement = () => {
    const current = raw ?? 0
    const next = current - step
    if (min !== undefined && next < min) return
    onChange(next)
  }

  const handleIncrement = () => {
    const current = raw ?? 0
    const next = current + step
    if (max !== undefined && next > max) return
    onChange(next)
  }

  return (
    <div className="flex items-center space-x-2">
      <Button 
        variant="outline" 
        size="icon" 
        type="button" 
        onClick={handleDecrement}
        disabled={raw !== undefined && min !== undefined && raw <= min}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={branch.alias}
        type="number"
        step={step}
        min={min}
        max={max}
        value={displayValue}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-24 text-center"
      />
      <Button 
        variant="outline" 
        size="icon" 
        type="button" 
        onClick={handleIncrement}
        disabled={raw !== undefined && max !== undefined && raw >= max}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
