// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Id the sidebar bookmarks scroll to: `?settings=<tab>&section=<id>` lands on `settings-section-<id>`. */
export const sectionDomId = (id: string) => `settings-section-${id}`

/** Id of a row's description, for its control to point at with `aria-describedby`. */
export const rowDescriptionDomId = (controlId: string) => `${controlId}-description`

/** Id of a section's description, for a form inside it to point at with `aria-describedby`. */
export const sectionDescriptionDomId = (id: string) => `${sectionDomId(id)}-description`
