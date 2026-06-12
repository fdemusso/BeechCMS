// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
