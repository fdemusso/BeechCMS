import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK']

interface CurrencySelectProps {
  value: string
  onValueChange: (value: string) => void
}

export function CurrencySelect({ value, onValueChange }: CurrencySelectProps) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('setup.currencyPlaceholder')} />
      </SelectTrigger>
      <SelectContent position="popper">
        {CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
