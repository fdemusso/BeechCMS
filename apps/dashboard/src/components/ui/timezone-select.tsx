import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, SortV as ChevronsUpDown } from 'reicon-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { TIMEZONES, getTimezoneLabel } from '@/components/ui/timezone-utils'

interface TimezoneSelectProps {
  value: string
  onValueChange: (value: string) => void
  id?: string
}

export function TimezoneSelect({ value, onValueChange, id }: TimezoneSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const popoverId = React.useId()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={popoverId}
          className="w-full justify-between font-normal h-8 border-input bg-transparent text-sm dark:bg-input/30"
        >
          <span className="truncate">
            {value ? getTimezoneLabel(value) : t('setup.timezonePlaceholder')}
          </span>
          <ChevronsUpDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent id={popoverId} className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t('setup.searchTimezonePlaceholder')}
            onValueChange={() => {
              if (listRef.current) {
                listRef.current.scrollTop = 0
              }
            }}
          />
          <CommandList ref={listRef}>
            <CommandEmpty>{t('setup.noTimezoneFound')}</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {TIMEZONES.map((tz) => {
                const label = getTimezoneLabel(tz)
                const city = tz.split('/').pop()?.replace('_', ' ') || ''
                const searchValue = `${city} ${tz}`
                return (
                  <CommandItem
                    key={tz}
                    value={searchValue}
                    onSelect={(currentValue) => {
                      const matchedTz = TIMEZONES.find((t) => {
                        const c = t.split('/').pop()?.replace('_', ' ') || ''
                        return `${c} ${t}`.toLowerCase() === currentValue.toLowerCase()
                      }) || tz
                      onValueChange(matchedTz)
                      setOpen(false)
                    }}
                  >
                    {label}
                    <Check
                      className={cn(
                        "ml-auto size-4",
                        value === tz ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
