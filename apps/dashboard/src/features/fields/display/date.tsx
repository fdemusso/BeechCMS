import type { FieldDisplayProps } from "../types"

export function DateDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }
  try {
    const date = new Date(value as string | number)
    const formatted = date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    return <div>{formatted}</div>
  } catch {
    return <div>{String(value)}</div>
  }
}
