// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { isSystemSeedSlug, type Seed } from "@beechcms/core"
import { Layers, Plus } from "@/components/icons"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import { useSettingsDialog } from "@/features/settings"
import { SEED_INTENT_NEW, SEED_INTENT_PARAM } from "@/features/seed-builder"
import { resolveIcon } from "@/lib/icon-registry"
import type { CommandPage } from "../types"

interface SchemaProps {
  seeds: Seed[]
  setOpen: (open: boolean) => void
}

/** Opens the content type builder (Settings › Content Types) with the create or edit dialog already up. */
function useOpenBuilder(setOpen: (open: boolean) => void) {
  const { openSettings } = useSettingsDialog()
  return (intent: string) => {
    openSettings("content-types", { [SEED_INTENT_PARAM]: intent })
    setOpen(false)
  }
}

interface SchemaActionsProps extends SchemaProps {
  pushPage: (page: CommandPage) => void
  /** Typing: list every content type as a direct "edit" hit instead of the one "Edit…" row. */
  searching: boolean
}

/** Root-page group for whoever holds `manage_seeds` globally. */
export function SchemaActions({ seeds, setOpen, pushPage, searching }: SchemaActionsProps) {
  const { t } = useTranslation()
  const openBuilder = useOpenBuilder(setOpen)
  const editable = seeds.filter((s) => !isSystemSeedSlug(s.slug))

  return (
    <CommandGroup heading={t("commandPalette.schema")}>
      <CommandItem
        onSelect={() => openBuilder(SEED_INTENT_NEW)}
        keywords={["seed", "schema", "nuovo tipo", "new type", "content type", "crea"]}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <span>{t("commandPalette.newContentType")}</span>
      </CommandItem>
      {searching ? (
        editable.map((seed) => (
          <SchemaEditItem key={seed.slug} seed={seed} onSelect={() => openBuilder(seed.slug)} />
        ))
      ) : (
        <CommandItem onSelect={() => pushPage("edit-schema")}>
          <Layers className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("commandPalette.editContentType")}</span>
        </CommandItem>
      )}
    </CommandGroup>
  )
}

function SchemaEditItem({ seed, onSelect }: { seed: Seed; onSelect: () => void }) {
  const { t } = useTranslation()
  const SeedIcon = resolveIcon(seed.dashboard?.icon)
  return (
    <CommandItem
      value={`schema ${seed.label} ${seed.slug}`}
      keywords={["schema", "seed", "modifica", "edit", "campi", "fields", seed.slug]}
      onSelect={onSelect}
    >
      <SeedIcon className="size-4 shrink-0 text-muted-foreground" />
      <span>{t("commandPalette.editSchemaOf", { label: seed.label })}</span>
    </CommandItem>
  )
}

/** The "Edit content type…" sub-page. */
export function EditSchemaView({ seeds, setOpen }: SchemaProps) {
  const { t } = useTranslation()
  const openBuilder = useOpenBuilder(setOpen)
  return (
    <CommandGroup heading={t("commandPalette.chooseContentType")}>
      {seeds.filter((s) => !isSystemSeedSlug(s.slug)).map((seed) => {
        const SeedIcon = resolveIcon(seed.dashboard?.icon)
        return (
          <CommandItem key={seed.slug} onSelect={() => openBuilder(seed.slug)} keywords={[seed.slug]}>
            <SeedIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <span>{seed.label}</span>
              <span className="text-[10px] text-muted-foreground">{seed.slug}</span>
            </div>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
