// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { backrefsApi } from './api'
export type { BackrefItem, BackrefGroup, BackrefsResponse } from './api'
export { useBackrefs, useBackrefsGroup, BACKREF_QUERY_KEY } from './hooks/use-backrefs'
export { ReferencedByPanel, DeleteButtonWithRestrict } from './referenced-by-panel'
export type { ReferencedByPanelProps } from './referenced-by-panel'
