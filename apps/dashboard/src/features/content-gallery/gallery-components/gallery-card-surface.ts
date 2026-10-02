// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"

/**
 * Superficie condivisa delle card cliccabili della gallery (foto e cartelle):
 * stesso rialzo, ombra e focus ring. Un solo posto da aggiornare per entrambe.
 */
export const GALLERY_CARD_SURFACE_CLASS = cn(
  "group flex w-full flex-col overflow-hidden rounded-2xl text-left",
  "bg-card border border-border",
  "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
  "transition-all duration-200",
  "hover:-translate-y-0.5 hover:border-border/80 hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.10),0_2px_6px_-1px_rgb(0,0,0,0.06)]",
  "dark:hover:border-border/60 dark:hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.3)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
)
