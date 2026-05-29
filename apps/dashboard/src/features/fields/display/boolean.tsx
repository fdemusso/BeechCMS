// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FieldDisplayProps } from "../types"

export function BooleanDisplay({ value }: FieldDisplayProps) {
  const isTrue = value === true || value === "true"
  return (
    <div className="flex items-center">
      <span
        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
          isTrue
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        }`}
      >
        {isTrue ? "Sì" : "No"}
      </span>
    </div>
  )
}
