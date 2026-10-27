// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferResponseType } from 'hono/client'
import type { rpc } from '@/lib/rpc'

// Read off the routes, not restated: the API is the only place these shapes are defined.
type Settings = typeof rpc.api.settings

export type NotificationPrefs = InferResponseType<Settings['notifications']['$get']>
export type UserProfile = InferResponseType<Settings['me']['$get']>
export type Session = InferResponseType<Settings['sessions']['$get']>[number]
export type ActivityEntry = InferResponseType<Settings['activity']['$get']>[number]
export type StorageStats = InferResponseType<Settings['storage']['$get']>
export type GeneralSettings = InferResponseType<Settings['$get']>

export type SettingsTab =
  | 'profile' | 'interface' | 'security' | 'storage' | 'notifications'
  | 'general' | 'content-types' | 'connected-apps'
  | 'users' | 'roles' | 'invitations'
