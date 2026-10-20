// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from "react"
import type { FolderStyle } from "@beechcms/core"
import {
  Folder, Star, Heart, Image, Camera, Calendar, Tag, Bookmark, Home,
  Gift, Video, Music, Book, Flag, Briefcase, Users, Sun, Crown,
} from "reicon-react"

type FolderColor = NonNullable<FolderStyle["color"]>
type FolderIconName = NonNullable<FolderStyle["icon"]>

// Full class names, never built by concatenation: Tailwind only emits classes it can read statically.
export const FOLDER_COLOR_CLASSES: Record<FolderColor, { swatch: string; banner: string; icon: string }> = {
  slate: { swatch: "bg-slate-500", banner: "from-slate-500/10 to-slate-500/25", icon: "text-slate-600 dark:text-slate-300" },
  red: { swatch: "bg-red-500", banner: "from-red-500/10 to-red-500/25", icon: "text-red-600 dark:text-red-400" },
  orange: { swatch: "bg-orange-500", banner: "from-orange-500/10 to-orange-500/25", icon: "text-orange-600 dark:text-orange-400" },
  amber: { swatch: "bg-amber-500", banner: "from-amber-500/10 to-amber-500/25", icon: "text-amber-600 dark:text-amber-400" },
  green: { swatch: "bg-green-500", banner: "from-green-500/10 to-green-500/25", icon: "text-green-600 dark:text-green-400" },
  teal: { swatch: "bg-teal-500", banner: "from-teal-500/10 to-teal-500/25", icon: "text-teal-600 dark:text-teal-400" },
  blue: { swatch: "bg-blue-500", banner: "from-blue-500/10 to-blue-500/25", icon: "text-blue-600 dark:text-blue-400" },
  violet: { swatch: "bg-violet-500", banner: "from-violet-500/10 to-violet-500/25", icon: "text-violet-600 dark:text-violet-400" },
  pink: { swatch: "bg-pink-500", banner: "from-pink-500/10 to-pink-500/25", icon: "text-pink-600 dark:text-pink-400" },
}

export const FOLDER_ICON_COMPONENTS: Record<FolderIconName, ComponentType<{ className?: string }>> = {
  Folder, Star, Heart, Image, Camera, Calendar, Tag, Bookmark, Home,
  Gift, Video, Music, Book, Flag, Briefcase, Users, Sun, Crown,
}
