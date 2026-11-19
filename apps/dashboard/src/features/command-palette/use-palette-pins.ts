// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PALETTE_PINS_MAX, type UiPreferences } from "@beechcms/core"
import { rpc } from "@/lib/rpc"

export type PalettePinsState =
  | { readonly status: "ready"; readonly ids: readonly string[]; readonly saving: boolean }
  | { readonly status: "unavailable" }

export interface PalettePinsApi {
  readonly state: PalettePinsState
  /** Appends `id`; toasts with `label`. No request when not ready, saving, already pinned or at PALETTE_PINS_MAX. */
  readonly pin: (id: string, label: string) => void
  /** Removes `id`; toasts with `label`. No request when not ready, saving or not pinned. */
  readonly unpin: (id: string, label: string) => void
}

function uiPreferencesQueryKey(userId: string | undefined) {
  return ["ui-preferences", userId] as const
}

/** The signed-in user's palette pins, persisted server side (`/api/settings/ui-preferences`). */
export function usePalettePins(userId: string | undefined): PalettePinsApi {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: uiPreferencesQueryKey(userId),
    enabled: userId !== undefined,
    queryFn: async (): Promise<UiPreferences> => {
      const response = await rpc.api.settings["ui-preferences"].$get()
      return response.json()
    },
  })

  const { mutate, isPending } = useMutation({
    mutationFn: async (palettePins: string[]): Promise<UiPreferences> => {
      const response = await rpc.api.settings["ui-preferences"].$put({ json: { palettePins } })
      return response.json()
    },
    // The cache only ever holds what the server stored.
    onSuccess: (stored) => queryClient.setQueryData(uiPreferencesQueryKey(userId), stored),
  })

  const state = React.useMemo<PalettePinsState>(
    () => (userId !== undefined && data ? { status: "ready", ids: data.palettePins, saving: isPending } : { status: "unavailable" }),
    [userId, data, isPending],
  )

  const save = React.useCallback(
    (palettePins: string[], successMessage: string) => {
      mutate(palettePins, {
        onSuccess: () => toast.success(successMessage),
        onError: () => toast.error(t("commandPalette.pins.saveFailed")),
      })
    },
    [mutate, t],
  )

  const pin = React.useCallback(
    (id: string, label: string) => {
      if (state.status !== "ready" || state.saving || state.ids.includes(id)) return
      if (state.ids.length >= PALETTE_PINS_MAX) {
        toast.error(t("commandPalette.pins.full", { max: PALETTE_PINS_MAX }))
        return
      }
      save([...state.ids, id], t("commandPalette.pins.pinned", { label }))
    },
    [state, save, t],
  )

  const unpin = React.useCallback(
    (id: string, label: string) => {
      if (state.status !== "ready" || state.saving || !state.ids.includes(id)) return
      save(state.ids.filter((pinnedId) => pinnedId !== id), t("commandPalette.pins.unpinned", { label }))
    },
    [state, save, t],
  )

  return React.useMemo(() => ({ state, pin, unpin }), [state, pin, unpin])
}
