import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api/settings.api'
import type { NotificationPrefs } from '../types/settings.types'

export const SETTINGS_QUERY_KEYS = {
  all: ['settings'] as const,
  profile: () => [...SETTINGS_QUERY_KEYS.all, 'profile'] as const,
  sessions: () => [...SETTINGS_QUERY_KEYS.all, 'sessions'] as const,
  activity: () => [...SETTINGS_QUERY_KEYS.all, 'activity'] as const,
  storage: () => [...SETTINGS_QUERY_KEYS.all, 'storage'] as const,
  notifications: () => [...SETTINGS_QUERY_KEYS.all, 'notifications'] as const,
}

export function useProfile() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.profile(),
    queryFn: settingsApi.getProfile,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.updateProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.profile() }),
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: settingsApi.changePassword })
}

export function useUpdateAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const url = await settingsApi.uploadAvatar(file)
      await settingsApi.updateAvatar(url)
      return url
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.profile() }),
  })
}

export function useSessions() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.sessions(),
    queryFn: settingsApi.getSessions,
    staleTime: 60 * 1000,
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.sessions() }),
  })
}

export function useSettingsActivity() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.activity(),
    queryFn: settingsApi.getActivity,
    staleTime: 60 * 1000,
  })
}

export function useStorageStats() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.storage(),
    queryFn: settingsApi.getStorage,
    staleTime: 5 * 60 * 1000,
  })
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.notifications(),
    queryFn: settingsApi.getNotifications,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prefs: NotificationPrefs) => settingsApi.updateNotifications(prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.notifications() }),
  })
}
