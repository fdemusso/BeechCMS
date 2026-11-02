// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from "hono/client"
import type { rpc } from "@/lib/rpc"

// Read off the routes, not restated: the API is the only place these shapes are defined.
type Stats = typeof rpc.api.content.stats

export type DashboardStats = InferResponseType<Stats["total"]["$get"]>
export type CloudflareStats = InferResponseType<Stats["cloudflare"]["$get"]>
export type RecentActivity = InferResponseType<Stats["recent-activity"]["$get"]>[number]
export type SystemHealth = InferResponseType<Stats["health"]["$get"]>
export type ContentBreakdown = InferResponseType<Stats["breakdown"]["$get"]>[number]
export type SetupChecklist = InferResponseType<Stats["setup-checklist"]["$get"]>
