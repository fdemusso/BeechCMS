import type { FieldDisplayProps } from "../types"

export function NumberDisplay({ value }: FieldDisplayProps) {
  if (value == null) {
    return <div className="text-muted-foreground">-</div>
  }
  const num = Number(value)
  const formatted = new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(num)
  return <div className="font-medium">{formatted}</div>
}
