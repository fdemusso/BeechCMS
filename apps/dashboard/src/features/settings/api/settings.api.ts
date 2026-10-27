// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from '@/lib/rpc'
import { uploadFile } from '@/lib/upload'
import type { NotificationPrefs, UserProfile, Session, ActivityEntry, StorageStats, GeneralSettings } from '../types/settings.types'

export const settingsApi = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await rpc.api.settings.me.$get()
    return response.json()
  },

  updateProfile: async (payload: { name?: string; surname?: string; email?: string }): Promise<void> => {
    await rpc.api.settings.profile.$put({ json: payload })
  },

  changePassword: async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
    await rpc.api.settings.password.$put({ json: payload })
  },

  updateAvatar: async (avatarUrl: string | null): Promise<void> => {
    await rpc.api.settings.avatar.$put({ json: { avatarUrl } })
  },

  uploadAvatar: async (file: File): Promise<string> => {
    return uploadFile(file)
  },

  getSessions: async (): Promise<Session[]> => {
    const response = await rpc.api.settings.sessions.$get()
    return response.json()
  },

  revokeSession: async (id: string): Promise<void> => {
    await rpc.api.settings.sessions[':id'].$delete({ param: { id } })
  },

  getActivity: async (): Promise<ActivityEntry[]> => {
    const response = await rpc.api.settings.activity.$get()
    return response.json()
  },

  getStorage: async (offset = 0): Promise<StorageStats> => {
    const response = await rpc.api.settings.storage.$get({ query: { offset: String(offset) } })
    return response.json()
  },

  deleteOrphans: async (keys: string[]): Promise<void> => {
    await rpc.api.settings.storage.orphans.delete.$post({ json: { keys } })
  },

  getNotifications: async (): Promise<NotificationPrefs> => {
    const response = await rpc.api.settings.notifications.$get()
    return response.json()
  },

  updateNotifications: async (prefs: NotificationPrefs): Promise<void> => {
    await rpc.api.settings.notifications.$put({ json: prefs })
  },

  getGeneralSettings: async (): Promise<GeneralSettings> => {
    const response = await rpc.api.settings.$get()
    return response.json()
  },

  updateGeneralSettings: async (payload: Partial<GeneralSettings>): Promise<void> => {
    await rpc.api.settings.$put({ json: payload })
  },
}
