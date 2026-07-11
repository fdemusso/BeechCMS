// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from '@/lib/api'
import { uploadFile } from '@/lib/upload'
import type { UserProfile, NotificationPrefs, Session, ActivityEntry, StorageStats, GeneralSettings } from '../types/settings.types'

export const settingsApi = {
  getProfile: async (): Promise<UserProfile> => {
    const { data } = await api.get<UserProfile>('/settings/me')
    return data
  },

  updateProfile: async (payload: { name?: string; surname?: string; email?: string }): Promise<void> => {
    await api.put('/settings/profile', payload)
  },

  changePassword: async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
    await api.put('/settings/password', payload)
  },

  updateAvatar: async (avatarUrl: string | null): Promise<void> => {
    await api.put('/settings/avatar', { avatarUrl })
  },

  uploadAvatar: async (file: File): Promise<string> => {
    return uploadFile(file)
  },

  getSessions: async (): Promise<Session[]> => {
    const { data } = await api.get<Session[]>('/settings/sessions')
    return data
  },

  revokeSession: async (id: string): Promise<void> => {
    await api.delete(`/settings/sessions/${id}`)
  },

  getActivity: async (): Promise<ActivityEntry[]> => {
    const { data } = await api.get<ActivityEntry[]>('/settings/activity')
    return data
  },

  getStorage: async (): Promise<StorageStats> => {
    const { data } = await api.get<StorageStats>('/settings/storage')
    return data
  },

  getNotifications: async (): Promise<NotificationPrefs> => {
    const { data } = await api.get<NotificationPrefs>('/settings/notifications')
    return data
  },

  updateNotifications: async (prefs: NotificationPrefs): Promise<void> => {
    await api.put('/settings/notifications', prefs)
  },

  getGeneralSettings: async (): Promise<GeneralSettings> => {
    const { data } = await api.get<GeneralSettings>('/settings')
    return data
  },

  updateGeneralSettings: async (payload: Partial<GeneralSettings>): Promise<void> => {
    await api.put('/settings', payload)
  },
}
