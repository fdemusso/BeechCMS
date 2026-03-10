import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { FieldEditProps } from "../types"

const textareaClassName = cn(
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
)

function parseTagsValue(value: unknown): Record<string, string> {
  if (!value) return {}
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, string>
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, string>
    } catch {
      // ignore
    }
  }
  return {}
}

export function JsonEdit({ branch, value, onChange }: FieldEditProps) {
  const isTagsField = branch.alias.toLowerCase().includes("tag")
  const hasOptions = isTagsField && (branch.options?.length ?? 0) > 0

  if (isTagsField && hasOptions) {
    const currentTags = parseTagsValue(value)
    const predefinedOptions = branch.options ?? []

    const DEFAULT_COLORS = [
      "#3b82f6", "#06b6d4", "#8b5cf6", "#10b981",
      "#f59e0b", "#ef4444", "#ec4899", "#64748b",
    ]

    const toggleTag = (tag: string) => {
      const next = { ...currentTags }
      if (next[tag] !== undefined) {
        delete next[tag]
      } else {
        // Assegna un colore default ciclico tra i predefiniti
        const idx = Object.keys(next).length % DEFAULT_COLORS.length
        next[tag] = DEFAULT_COLORS[idx]
      }
      onChange(next)
    }

    return (
      <div className="flex flex-col gap-2">
        {/* Badge cliccabili per le opzioni predefinite */}
        <div className="flex flex-wrap gap-1.5">
          {predefinedOptions.map((opt: string) => {
            const isActive = currentTags[opt] !== undefined
            return (
              <Badge
                key={opt}
                variant={isActive ? "default" : "outline"}
                className="cursor-pointer select-none text-xs transition-opacity hover:opacity-80"
                style={isActive ? { backgroundColor: currentTags[opt] } : undefined}
                onClick={() => toggleTag(opt)}
              >
                {opt}
              </Badge>
            )
          })}
        </div>

        {/* Textarea per modifiche avanzate / tag non predefiniti */}
        <textarea
          id={branch.alias}
          className={textareaClassName}
          value={
            typeof value === "string"
              ? value
              : value != null
                ? JSON.stringify(value, null, 2)
                : ""
          }
          onChange={(e) => onChange(e.target.value)}
          placeholder='{"cms": "#3b82f6", "react": "#06b6d4"}'
        />
        <p className="text-xs text-muted-foreground">
          Clicca un badge per aggiungere/rimuovere un tag, oppure modifica il JSON direttamente.
        </p>
      </div>
    )
  }

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
