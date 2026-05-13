import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function NumberEdit({ branch, value, onChange }: FieldEditProps) {
  const raw = value as number | undefined
  const displayValue = raw !== undefined && raw !== null ? raw : ""
  return (
    <Input
      id={branch.alias}
      type="number"
      step="any"
      value={displayValue}
      onChange={(e) =>
        onChange(e.target.value === "" ? "" : Number(e.target.value))
      }
    />
  )
}
