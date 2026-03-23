import { Input } from "@/components/ui/input"
import type { FieldDisplayProps, FieldEditProps } from "./types"

/**
 * Display fallback: mostra il valore come stringa o "-" se vuoto.
 * Usato quando il BranchType non è registrato nel registro.
 */
export function DefaultDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  return <div>{String(value)}</div>
}

/**
 * Edit fallback: input di testo generico.
 * Usato quando il BranchType non è registrato nel registro.
 */
export function DefaultEdit(props: Readonly<FieldEditProps>) {
  const { branch, value, onChange } = props
  const str = value == null ? "" : String(value)
  return (
    <Input
      id={branch.alias}
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
