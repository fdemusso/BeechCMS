import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

export const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [
      'Europe/Rome',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney',
    ]
  }
})()

export function getTimezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    const tzPart = parts.find((part) => part.type === 'timeZoneName')
    const offset = tzPart ? tzPart.value.replace('GMT', 'UTC') : ''
    
    const tzParts = tz.split('/')
    const city = tzParts[tzParts.length - 1].replace('_', ' ')
    const region = tzParts.slice(0, -1).join('/')
    
    if (region) {
      return `${city} (${region}, ${offset})`
    }
    return offset ? `${city} (${offset})` : city
  } catch {
    return tz
  }
}

interface TimezoneSelectProps {
  value: string
  onValueChange: (value: string) => void
}

export function TimezoneSelect({ value, onValueChange }: TimezoneSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 border-input bg-transparent text-sm"
        >
          <span className="truncate">
            {value ? getTimezoneLabel(value) : t('setup.timezonePlaceholder')}
          </span>
          <ChevronsUpDown className="opacity-50 size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
