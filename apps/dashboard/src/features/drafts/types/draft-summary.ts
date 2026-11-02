// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { InferResponseType } from "hono/client"
import type { rpc } from "@/lib/rpc"

export type DraftSummary = InferResponseType<typeof rpc.api.content.drafts.$get>[number]
