// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const fetchBlobAsFile = async (src: string, fileName: string) => {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type })
}
