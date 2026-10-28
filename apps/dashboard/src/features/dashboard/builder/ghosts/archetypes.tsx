// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { Plus } from '@/components/icons'
import { GhostSkeleton as Skeleton } from '@/components/builder/ghost-skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GhostShell, seededRandom, seededSeries, type GhostShellProps } from './ghost-parts'

/**
 * Inert stand-ins for the widgets, one per visual family. Real text (the title, a note's content) and real
 * controls (the quick-draft button) are used where they cost nothing; charts, tables and lists are
 * skeletons shaped like the real thing. Recharts is never mounted: a chart ghost is plain SVG.
 */

export interface ArchetypeProps {
  /** Stable per widget, seeds the variation. */
  readonly seed: string
  readonly variant?: string
  readonly shell: Omit<GhostShellProps, 'children' | 'minHeight' | 'action'>
  /** The note's text, for the text archetype. */
  readonly text?: string
  readonly align?: 'left' | 'center'
}

const FilterPill = () => <Skeleton className="h-7 w-24 rounded-md" />

// ── stat ────────────────────────────────────────────────────────────────────

export function StatGhost({ seed, shell }: ArchetypeProps) {
  const [wide] = seededSeries(seed, 1, 55, 85)
  return (
    <div className="flex h-full min-h-[132px] w-full flex-col justify-between rounded-2xl border bg-card/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="truncate font-heading text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {shell.title}
          </p>
          <Skeleton className="h-8 min-w-16" style={{ width: `${wide}%` }} />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-xl" />
      </div>
      <div className="mt-6 flex items-end justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-20" />
      </div>
    </div>
  )
}

export function StatTrioGhost({ shell }: ArchetypeProps) {
  return (
    <GhostShell {...shell} minHeight={104}>
      <div className="grid h-full grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col justify-center gap-1.5 rounded-lg border-l-2 border-foreground/10 bg-foreground/[0.03] px-3 py-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

// ── charts ──────────────────────────────────────────────────────────────────

function ChartFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="relative h-44 w-full">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute inset-x-0 border-t border-foreground/5" style={{ top: `${i * 33}%` }} />
      ))}
      {children}
    </div>
  )
}

function linePath(seed: string, width: number, height: number): string {
  const ys = seededSeries(seed, 8, 15, 85)
  return ys
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${(i / (ys.length - 1)) * width} ${(y / 100) * height}`)
    .join(' ')
}

export function ChartGhost({ seed, variant, shell }: ArchetypeProps) {
  const kind = variant === 'bar' || variant === 'area' ? variant : 'line'
  const bars = seededSeries(seed, 12, 22, 92)
  const path = linePath(seed, 100, 40)
  return (
    <GhostShell {...shell} action={<FilterPill />} minHeight={280}>
      <ChartFrame>
        {kind === 'bar' ? (
          <div className="absolute inset-0 flex items-end gap-2 px-1">
            {bars.map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible text-foreground">
            {kind === 'area' && <path d={`${path} L100 40 L0 40 Z`} fill="currentColor" className="opacity-[0.07]" />}
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="opacity-20" />
          </svg>
        )}
      </ChartFrame>
      <div className="mt-3 flex justify-between">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-2.5 w-8" />)}
      </div>
    </GhostShell>
  )
}

export function PieGhost({ seed, shell }: ArchetypeProps) {
  const [a, b] = seededSeries(seed, 2, 25, 40)
  const circ = 2 * Math.PI * 38
  const segments = [a, b, 100 - a - b - 12].map((v) => (v / 100) * circ)
  const opacities = ['opacity-20', 'opacity-10', 'opacity-[0.06]']
  return (
    <GhostShell {...shell} minHeight={260}>
      <div className="flex h-full items-center gap-6">
        <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90 text-foreground">
          {segments.map((len, i) => {
            const offset = segments.slice(0, i).reduce((sum, v) => sum + v + 4, 0)
            return (
              <circle
                key={i}
                cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="14"
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
                className={opacities[i]}
              />
            )
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: `${85 - i * 18}%` }} />
            </div>
          ))}
        </div>
      </div>
    </GhostShell>
  )
}

// ── table, lists, gallery ───────────────────────────────────────────────────

export function TableGhost({ seed, shell }: ArchetypeProps) {
  const next = seededRandom(seed)
  const rows = Array.from({ length: 4 }, () => [next(), next(), next()])
  return (
    <GhostShell {...shell} minHeight={240}>
      <div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b pb-2.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-3 w-1/2" />)}
        </div>
        {rows.map((row, r) => (
          <div key={r} className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 border-b border-foreground/5 py-3 last:border-0">
            {row.map((v, c) => <Skeleton key={c} className="h-3" style={{ width: `${(c === 0 ? 45 : 30) + v * 40}%` }} />)}
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

export function ListGhost({ seed, variant, shell }: ArchetypeProps) {
  const widths = seededSeries(seed, 4, 45, 80)
  const tiles = variant === 'cards' || variant === 'grid'
  return (
    <GhostShell {...shell} minHeight={228}>
      <div className="space-y-3.5">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className={cn('size-9 shrink-0', tiles ? 'rounded-lg' : 'rounded-full')} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3" style={{ width: `${w}%` }} />
              <Skeleton className="h-2.5" style={{ width: `${w * 0.55}%` }} />
            </div>
            <Skeleton className="h-2.5 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

export function GalleryGhost({ shell }: ArchetypeProps) {
  return (
    <GhostShell {...shell} minHeight={228}>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
      </div>
    </GhostShell>
  )
}

// ── text, form, actions, checklist ──────────────────────────────────────────

/** A note is drawn with its real text: it has no card of its own on the dashboard. */
export function TextGhost({ seed, text, align }: ArchetypeProps) {
  if (text?.trim()) {
    return (
      <div className={cn('line-clamp-6 min-h-16 whitespace-pre-wrap p-5 text-sm text-muted-foreground', align === 'center' && 'text-center')}>
        {text}
      </div>
    )
  }
  const widths = seededSeries(seed, 3, 45, 95)
  return (
    <div className="min-h-16 space-y-2 p-5">
      {widths.map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
    </div>
  )
}

export function FormGhost({ shell }: ArchetypeProps) {
  return (
    <GhostShell {...shell} minHeight={172}>
      <div className="space-y-3">
        <div className="flex h-8 items-center rounded-control border border-input px-2.5">
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Button type="button" variant="outline" size="sm" disabled className="w-full" tabIndex={-1}>
          <Plus className="size-4" />
        </Button>
      </div>
    </GhostShell>
  )
}

export function ActionsGhost({ shell }: ArchetypeProps) {
  return (
    <GhostShell {...shell} minHeight={172}>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-20 flex-col items-center justify-center gap-2 rounded-lg bg-foreground/[0.03]">
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

export function ChecklistGhost({ seed, shell }: ArchetypeProps) {
  const widths = seededSeries(seed, 4, 40, 75)
  return (
    <GhostShell {...shell} minHeight={196}>
      <div className="space-y-3.5">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="h-3" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

// ── system ──────────────────────────────────────────────────────────────────

export function MeterGhost({ seed, shell }: ArchetypeProps) {
  const [fill] = seededSeries(seed, 1, 25, 70)
  return (
    <GhostShell {...shell} minHeight={132}>
      <div className="flex h-full flex-col justify-center gap-3">
        <Skeleton className="h-8 w-24" />
        <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/5">
          <div className="h-full rounded-full bg-foreground/15" style={{ width: `${fill}%` }} />
        </div>
        <Skeleton className="h-2.5 w-32" />
      </div>
    </GhostShell>
  )
}

export function StatusGhost({ seed, shell }: ArchetypeProps) {
  const widths = seededSeries(seed, 3, 40, 80)
  return (
    <GhostShell {...shell} minHeight={132}>
      <div className="space-y-3.5">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-2.5 shrink-0 rounded-full" />
            <Skeleton className="h-3" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </GhostShell>
  )
}

export function GenericGhost({ seed, shell }: ArchetypeProps) {
  const widths = seededSeries(seed, 3, 40, 90)
  return (
    <GhostShell {...shell} minHeight={148}>
      <div className="space-y-2.5">
        {widths.map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
        <Skeleton className="mt-4 h-16 w-full rounded-lg" />
      </div>
    </GhostShell>
  )
}
