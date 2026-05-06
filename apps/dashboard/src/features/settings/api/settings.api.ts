import { api } from '@/lib/api'
import type { UserProfile, NotificationPrefs, Session, ActivityEntry, StorageStats } from '../types/settings.types'

export const settingsApi = {
  getProfile: async (): Promise<UserProfile> => {
    const { data } = await api.get<UserProfile>('/settings/me')
    return data
  },

  updateProfile: async (payload: { name?: string; email?: string }): Promise<void> => {
    await api.put('/settings/profile', payload)
  },

  changePassword: async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
    await api.put('/settings/password', payload)
  },

  updateAvatar: async (avatarUrl: string | null): Promise<void> => {
    await api.put('/settings/avatar', { avatarUrl })
  },

  uploadAvatar: async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<{ url: string }>('/upload', formData)
    return data.url
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

  getGeneralSettings: async (): Promise<{ dateFormat: string; siteTitle: string }> => {
    const { data } = await api.get<{ dateFormat: string; siteTitle: string }>('/settings')
    return data
  },
}
