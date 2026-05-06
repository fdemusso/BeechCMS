import { DatePickerInput } from "@/components/ui/date-picker-input"
import type { FieldEditProps } from "../types"

export function DateEdit({ branch, value, onChange }: FieldEditProps) {
  return (
    <DatePickerInput
      id={branch.alias}
      value={value as string | null}
      onChange={onChange}
      placeholder="Seleziona una data"
    />
  )
}
