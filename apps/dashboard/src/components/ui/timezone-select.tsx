import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, SortV as ChevronsUpDown } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  // The element that scrolls, to bring a new search back to the top of the list.
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const popoverId = React.useId()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          // Only while it exists: the popover is not in the page when closed, and a reference to nothing is an error.
          aria-controls={open ? popoverId : undefined}
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
              if (viewportRef.current) {
                viewportRef.current.scrollTop = 0
              }
            }}
          />
          {/* The scrolling is the ScrollArea's, not the list's: the list gives up its own cap and overflow. */}
          <CommandList className="max-h-none overflow-visible">
            <CommandEmpty>{t('setup.noTimezoneFound')}</CommandEmpty>
            <ScrollArea
              className="max-h-60 [&_[data-slot=scroll-area-viewport]>div]:!block"
              viewportProps={{ ref: viewportRef }}
            >
            <CommandGroup>
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
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
