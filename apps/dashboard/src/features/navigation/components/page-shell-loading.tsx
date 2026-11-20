// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { AppShell } from "./app-shell"

interface PageShellLoadingProps {
  readonly message: string
}

/** Full page shell (sidebar + body card) around a centered loading message, for a page's own loading state. */
export function PageShellLoading({ message }: PageShellLoadingProps) {
  return (
    <AppShell>
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="text-muted-foreground">{message}</div>
      </div>
    </AppShell>
  )
}
