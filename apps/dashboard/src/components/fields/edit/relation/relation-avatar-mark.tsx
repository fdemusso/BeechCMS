// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { RelationIdentity } from "../../display/relation-identity"

/** The avatar of a related entry: its image, with the initials (or id tail) while missing or loading. */
export function RelationAvatarMark({ identity }: { readonly identity: Pick<RelationIdentity, "initials" | "imageUrl"> }) {
  return (
    <Avatar size="sm" aria-hidden>
      {identity.imageUrl ? <AvatarImage src={identity.imageUrl} alt="" /> : null}
      <AvatarFallback>{identity.initials}</AvatarFallback>
    </Avatar>
  )
}
