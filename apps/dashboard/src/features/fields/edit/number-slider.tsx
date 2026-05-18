import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import type { FieldEditProps } from "../types"

export function NumberSlider({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const opts = branch.numberOptions
  
  const min = opts?.min ?? 0
  const max = opts?.max ?? 100
  const step = opts?.step ?? 1
  
  const current = raw !== undefined && raw !== null ? raw : min

  return (
    <div className="flex items-center space-x-4 py-2">
      <Slider
        id={branch.alias}
        min={min}
        max={max}
        step={step}
        value={[current]}
        onValueChange={(vals) => onChange(vals[0])}
        className="flex-1"
        aria-label={branch.label ?? branch.alias}
      />
      <Badge variant="secondary" className="w-12 justify-center font-mono">
        {current}
      </Badge>
    </div>
  )
}
