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
import type { FilterGroupType } from "../shared"

interface FilterConditionInputProps {
  readonly type: FilterGroupType
  readonly value: string | number | boolean | null
  readonly onChange: (value: string | number | boolean | null) => void
  readonly selectOptions?: string[]
  readonly availableTags?: string[]
  readonly className?: string
  readonly textClassName?: string
  readonly buttonPlaceholder?: string
}

function renderNumberInput(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  className: string,
  textClassName: string,
) {
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

function renderDateInput(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  className: string,
  textClassName: string,
) {
  return (
    <Input
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${className} ${textClassName}`.trim()}
    />
  )
}

function renderBooleanSelect(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  className: string,
  textClassName: string,
) {
  let selectValue = ""
  if (value === true) selectValue = "true"
  else if (value === false) selectValue = "false"
  const handleValueChange = (v: string) => {
    if (v === "true") return onChange(true)
    if (v === "false") return onChange(false)
    return onChange(null)
  }

  return (
    <Select value={selectValue} onValueChange={handleValueChange}>
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

function renderSelectDropdown(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  selectOptions: string[],
  className: string,
  textClassName: string,
  buttonPlaceholder: string,
) {
  return (
    <DropdownMenu modal={false}>
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

function renderTagsDropdown(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  availableTags: string[],
  className: string,
  textClassName: string,
) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${className} justify-between ${textClassName}`.trim()}
        >
          <span className="truncate">
            {typeof value === "string" && value ? value : "Tag..."}
          </span>
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

function renderTextInput(
  value: FilterConditionInputProps["value"],
  onChange: FilterConditionInputProps["onChange"],
  className: string,
  textClassName: string,
) {
  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${className} ${textClassName}`.trim()}
      placeholder="Valore..."
    />
  )
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
  switch (type) {
    case "number":
      return renderNumberInput(value, onChange, className, textClassName)
    case "date":
      return renderDateInput(value, onChange, className, textClassName)
    case "boolean":
      return renderBooleanSelect(value, onChange, className, textClassName)
    case "select":
      return renderSelectDropdown(
        value,
        onChange,
        selectOptions,
        className,
        textClassName,
        buttonPlaceholder,
      )
    case "tags":
      return renderTagsDropdown(value, onChange, availableTags, className, textClassName)
    default:
      return renderTextInput(value, onChange, className, textClassName)
  }
}
