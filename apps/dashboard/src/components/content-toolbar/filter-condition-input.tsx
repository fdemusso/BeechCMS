import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FilterGroupType } from "./shared"

interface FilterConditionInputProps {
  type: FilterGroupType
  value: string | number | boolean | null
  onChange: (value: string | number | boolean | null) => void
  selectOptions?: string[]
  availableTags?: string[]
  className?: string
  textClassName?: string
  buttonPlaceholder?: string
}

export function FilterConditionInput({
  type,
  value,
  onChange,
  selectOptions = [],
  availableTags = [],
  className = "h-8 flex-1",
  textClassName = "text-xs",
  buttonPlaceholder = "Scegli...",
}: FilterConditionInputProps) {
  if (type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw.trim() === "" ? null : Number(raw))
        }}
        className={`${className} ${textClassName}`.trim()}
        placeholder="Valore..."
      />
    )
  }

  if (type === "date") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${className} ${textClassName}`.trim()}
      />
    )
  }

  if (type === "boolean") {
    return (
      <Select
        value={value === true ? "true" : value === false ? "false" : ""}
        onValueChange={(v) => onChange(v === "true" ? true : v === "false" ? false : null)}
      >
        <SelectTrigger size="sm" className={`${className} ${textClassName}`.trim()}>
          <SelectValue placeholder="Valore..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Vero</SelectItem>
          <SelectItem value="false">Falso</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (type === "select") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${className} justify-between ${textClassName}`.trim()}
          >
            <span className="truncate">
              {typeof value === "string" && value ? value : buttonPlaceholder}
            </span>
            <ArrowUpDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-1">
          {selectOptions.map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={value === opt ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-full justify-start px-2 text-xs"
              onClick={() => onChange(opt)}
            >
              {opt}
            </Button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (type === "tags") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${className} justify-between ${textClassName}`.trim()}
          >
            <span className="truncate">{typeof value === "string" && value ? value : "Tag..."}</span>
            <ArrowUpDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-56 w-56 overflow-y-auto p-1">
          {availableTags.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant={value === tag ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-full justify-start px-2 text-xs"
              onClick={() => onChange(tag)}
            >
              {tag}
            </Button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${className} ${textClassName}`.trim()}
      placeholder="Valore..."
    />
  )
}
