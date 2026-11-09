// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"

/**
 * Superficie condivisa delle card cliccabili della gallery (foto e cartelle):
 * stesso rialzo, ombra e focus ring. Un solo posto da aggiornare per entrambe.
 */
export const GALLERY_CARD_SURFACE_CLASS = cn(
  "group flex w-full flex-col overflow-hidden rounded-lg text-left",
  "bg-card border border-border",
  "transition-all",
  "hover:-translate-y-0.5 hover:border-border/80",
  "dark:hover:border-border/60",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
)
