import type { FieldDisplayProps } from "../types"
import { formatNumber } from "./number-format"

export function NumberDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null) {
    return <div className="text-muted-foreground">-</div>
  }
  const num = Number(value)
  const formatted = formatNumber(num, branch.numberOptions)
  return <div className="font-medium">{formatted}</div>
}
