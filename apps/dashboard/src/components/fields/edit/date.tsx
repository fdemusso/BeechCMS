import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function DateEdit({ branch, value, onChange }: FieldEditProps) {
  const dateValue =
    value != null && value !== ""
      ? new Date(value as string).toISOString().split("T")[0]
      : ""
  return (
    <Input
      id={branch.alias}
      type="date"
      value={dateValue}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
