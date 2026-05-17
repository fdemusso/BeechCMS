import { Input } from "@/components/ui/input"
import type { FieldEditProps } from "../types"

export function TextEdit({ branch, value, onChange }: FieldEditProps) {
  const str = (value as string) ?? ""
  return (
    <Input
      id={branch.alias}
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
