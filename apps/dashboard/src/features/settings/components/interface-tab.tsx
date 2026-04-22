import * as React from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const ROWS_KEY = 'beech_rows_per_page'
const LANGUAGE_KEY = 'beech_language'

const ROWS_OPTIONS = [
  { value: '10', label: '10 righe' },
  { value: '20', label: '20 righe' },
  { value: '50', label: '50 righe' },
  { value: '100', label: '100 righe' },
]

const LANGUAGE_OPTIONS = [
  { value: 'it', label: '🇮🇹  Italiano' },
  { value: 'en', label: '🇬🇧  English' },
]

const THEME_OPTIONS = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

export function InterfaceTab() {
  const { theme, setTheme } = useTheme()
  const [rows, setRows] = React.useState(() => localStorage.getItem(ROWS_KEY) ?? '20')
  const [language, setLanguage] = React.useState(() => localStorage.getItem(LANGUAGE_KEY) ?? 'it')

  const handleRowsChange = (value: string) => {
    setRows(value)
    localStorage.setItem(ROWS_KEY, value)
    toast.success('Preferenza salvata — si applica al prossimo caricamento')
  }

  const handleLanguageChange = (value: string) => {
    setLanguage(value)
    localStorage.setItem(LANGUAGE_KEY, value)
    toast.success('Lingua salvata — si applica al prossimo caricamento')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>Scegli l'aspetto visivo dell'interfaccia.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer ${
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Icon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lingua</CardTitle>
          <CardDescription>Lingua dell'interfaccia di amministrazione.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="language">Lingua</Label>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger id="language" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contenuti per pagina</CardTitle>
          <CardDescription>Numero di elementi mostrati nelle liste contenuti.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="rows">Righe per pagina</Label>
            <Select value={rows} onValueChange={handleRowsChange}>
              <SelectTrigger id="rows" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
