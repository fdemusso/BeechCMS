"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parse, isValid } from "date-fns"

import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useGeneralSettings } from "@/features/settings/hooks/use-settings"

// Helper to map wrangler/standard formats to date-fns formats
function getDisplayFormat(configFormat: string | undefined): string {
  if (!configFormat) return "dd-MM-yyyy"
  // Map DD-MM-YYYY to dd-MM-yyyy, etc.
  return configFormat
    .replace(/DD/g, "dd")
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
}

function formatDate(date: Date | undefined, displayFormat: string) {
  if (!date || !isValid(date)) {
    return ""
  }
  return format(date, displayFormat)
}

function parseInputDate(text: string, displayFormat: string): Date | undefined {
  if (!text.trim()) return undefined
  const parsed = parse(text, displayFormat, new Date())
  return isValid(parsed) ? parsed : undefined
}

export function DatePickerInput({
  value: externalValue,
  onChange: externalOnChange,
  placeholder,
  id,
  label,
}: {
  value?: string | null
  onChange?: (value: string | null) => void
  placeholder?: string
  id?: string
  label?: string
}) {
  const { data: settings } = useGeneralSettings()
  const displayFormat = getDisplayFormat(settings?.dateFormat)
  
  const [open, setOpen] = React.useState(false)
  
  // Initial state logic (internal state uses Date objects)
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (!externalValue) return undefined
    const d = new Date(externalValue)
    return isValid(d) ? d : undefined
  })
  const [month, setMonth] = React.useState<Date | undefined>(date)
  
  // Text value used in the input field
  const [textValue, setTextValue] = React.useState(formatDate(date, displayFormat))

  const [isFocused, setIsFocused] = React.useState(false)

  // Sync internal state with external value when it changes from outside
  React.useEffect(() => {
    if (isFocused) return

    if (!externalValue) {
      setDate(undefined)
      setTextValue("")
      return
    }
    const d = new Date(externalValue)
    if (isValid(d)) {
      setDate(d)
      setMonth(d)
      setTextValue(formatDate(d, displayFormat))
    }
  }, [externalValue, isFocused, displayFormat])

  const notifyChange = (newDate: Date | undefined) => {
    if (!externalOnChange) return
    if (newDate && isValid(newDate)) {
      // Storage format is always YYYY-MM-DD
      const y = newDate.getFullYear()
      const m = String(newDate.getMonth() + 1).padStart(2, "0")
      const d = String(newDate.getDate()).padStart(2, "0")
      externalOnChange(`${y}-${m}-${d}`)
    } else {
      externalOnChange(null)
    }
  }

  const commitValue = (currentText: string) => {
    const parsedDate = parseInputDate(currentText, displayFormat)
    if (parsedDate) {
      setDate(parsedDate)
      setMonth(parsedDate)
      setTextValue(formatDate(parsedDate, displayFormat))
      notifyChange(parsedDate)
    } else if (currentText.trim() === "") {
      setDate(undefined)
      setTextValue("")
      notifyChange(undefined)
    } else {
      // Revert if invalid
      setTextValue(formatDate(date, displayFormat))
    }
  }

  return (
    <Field className="w-full">
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <InputGroup>
        <InputGroupInput
          id={id}
          value={textValue}
          placeholder={placeholder || displayFormat.toUpperCase()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            commitValue(textValue)
          }}
          onChange={(e) => {
            setTextValue(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitValue(textValue)
              e.currentTarget.blur()
            }
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <InputGroupButton
                id={`${id}-picker`}
                variant="ghost"
                size="icon-xs"
                aria-label="Select date"
              >
                <CalendarIcon />
                <span className="sr-only">Select date</span>
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto overflow-hidden p-0"
              align="end"
              alignOffset={-8}
              sideOffset={10}
            >
              <Calendar
                mode="single"
                selected={date}
                month={month}
                onMonthChange={setMonth}
                onSelect={(selectedDate) => {
                  setDate(selectedDate)
                  setTextValue(formatDate(selectedDate, displayFormat))
                  notifyChange(selectedDate)
                  setOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
