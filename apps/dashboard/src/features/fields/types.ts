// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch } from "@beechcms/core"

/** Props condivise per i componenti di sola lettura (display) */
export interface FieldDisplayProps {
  readonly branch: Branch
  readonly value: unknown
  /** Opzioni di visualizzazione (es. troncamento in tabella) */
  readonly options?: {
    readonly maxLength?: number
  }
}

/** Props condivise per i componenti di edit */
export interface FieldEditProps {
  readonly branch: Branch
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}
