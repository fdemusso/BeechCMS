import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { Seed, Branch, KanbanCardConfig, CardSlotField } from '@beechcms/core'
import { isCardEligibleBranch, METADATA_SLOT_CAP } from '@beechcms/core'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
  seed: Seed
  config: KanbanCardConfig | undefined
  onSave: (next: KanbanCardConfig) => void
  /** Restricts the Media slot to the branches it accepts (Gallery: image files only). Default: every eligible branch. */
  mediaBranchFilter?: (branch: Branch) => boolean
  /** Shown when no card is saved yet (the layout the view currently renders by default). */
  defaultConfig?: KanbanCardConfig
}

const NONE = '__none__'

function toSlotField(branchId: string | undefined): CardSlotField | null {
  return branchId && branchId !== NONE ? { branchId } : null
}

export function CardConfigDialog({ open, onClose, seed, config, onSave, mediaBranchFilter, defaultConfig }: Props) {
  const { t } = useTranslation()
  const shown = config ?? defaultConfig
  const eligible = seed.branches.filter(isCardEligibleBranch)
  const mediaBranches = mediaBranchFilter ? eligible.filter(mediaBranchFilter) : eligible

  const [mediaId, setMediaId] = React.useState<string>(shown?.media?.branchId ?? NONE)
  const [headerId, setHeaderId] = React.useState<string>(shown?.header?.branchId ?? NONE)
  const [subtitleId, setSubtitleId] = React.useState<string>(shown?.subtitle?.branchId ?? NONE)
  const [metadataIds, setMetadataIds] = React.useState<string[]>(
    (shown?.metadata ?? []).map(f => f.branchId),
  )

  React.useEffect(() => {
    if (open) {
      setMediaId(shown?.media?.branchId ?? NONE)
      setHeaderId(shown?.header?.branchId ?? NONE)
      setSubtitleId(shown?.subtitle?.branchId ?? NONE)
      setMetadataIds((shown?.metadata ?? []).map(f => f.branchId))
    }
  }, [open, shown])

  function toggleMetadata(branchId: string) {
    setMetadataIds(prev => {
      if (prev.includes(branchId)) return prev.filter(id => id !== branchId)
      if (prev.length >= METADATA_SLOT_CAP) return prev
      return [...prev, branchId]
    })
  }

  function handleSave() {
    onSave({
      version: 1,
      media: toSlotField(mediaId) ?? undefined,
      header: toSlotField(headerId) ?? undefined,
      subtitle: toSlotField(subtitleId) ?? undefined,
      metadata: metadataIds.map(id => ({ branchId: id })),
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('kanban.cardConfig.title', 'Card layout')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <SlotPicker
            label={t('kanban.cardConfig.mediaSlot', 'Media')}
            value={mediaId}
            onChange={setMediaId}
            branches={mediaBranches}
          />
          <SlotPicker
            label={t('kanban.cardConfig.headerSlot', 'Header')}
            value={headerId}
            onChange={setHeaderId}
            branches={eligible}
          />
          <SlotPicker
            label={t('kanban.cardConfig.subtitleSlot', 'Subtitle')}
            value={subtitleId}
            onChange={setSubtitleId}
            branches={eligible}
          />
          <div>
            <p className="text-sm font-medium mb-1.5">
              {t('kanban.cardConfig.metadataSlot', 'Metadata')}
              <span className="text-muted-foreground text-xs ml-1">({metadataIds.length}/{METADATA_SLOT_CAP})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {eligible.map(b => {
                const active = metadataIds.includes(b.id)
                const disabled = !active && metadataIds.length >= METADATA_SLOT_CAP
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMetadata(b.id)}
                    className={`rounded-sm px-2 py-0.5 text-xs border transition-colors
                      ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-transparent'}
                      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-muted-foreground'}`}
                  >
                    {b.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SlotPickerProps {
  label: string
  value: string
  onChange: (id: string) => void
  branches: import('@beechcms/core').Branch[]
}

function SlotPicker({ label, value, onChange, branches }: SlotPickerProps) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('kanban.cardConfig.noField', 'No field')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('kanban.cardConfig.noField', 'No field')}</SelectItem>
          {branches.map(b => (
            <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
