import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"

const textareaClassName = cn(
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
)

export function JsonEdit({ branch, value, onChange }: FieldEditProps) {
  const isTagsField = branch.alias.toLowerCase().includes("tag")
  const strValue =
    typeof value === "string"
      ? value
      : value != null
        ? JSON.stringify(value, null, 2)
        : ""

  return (
    <div>
      <textarea
        id={branch.alias}
        className={textareaClassName}
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isTagsField
            ? '{"cms": "#3b82f6", "react": "#06b6d4", "typescript": "#8b5cf6"}'
            : '{"key": "value"}'
        }
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {isTagsField
          ? 'Oggetto tag→colore, es: {"cms": "blue", "react": "green"}'
          : 'Oggetto JSON, es: {"client": "Nome"}'}
      </p>
    </div>
  )
}
