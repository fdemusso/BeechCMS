// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api/settings.api'
import type { NotificationPrefs } from '../types/settings.types'
import { GENERAL_SETTINGS_QUERY_KEY, ME_QUERY_KEY, useMe } from "@/features/shared"

export const SETTINGS_QUERY_KEYS = {
  all: ['settings'] as const,
  /** Same key as `features/shared`'s `useMe()` — one cache entry for `/settings/me`. */
  profile: () => ME_QUERY_KEY,
  sessions: () => [...SETTINGS_QUERY_KEYS.all, 'sessions'] as const,
  activity: () => [...SETTINGS_QUERY_KEYS.all, 'activity'] as const,
  storage: (offset: number) => [...SETTINGS_QUERY_KEYS.all, 'storage', offset] as const,
  notifications: () => [...SETTINGS_QUERY_KEYS.all, 'notifications'] as const,
  general: () => GENERAL_SETTINGS_QUERY_KEY,
}

export function useGeneralSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.general(),
    queryFn: settingsApi.getGeneralSettings,
    staleTime: 24 * 60 * 60 * 1000, // Very stable
  })
}

export function useUpdateGeneralSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.updateGeneralSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.general() })
    },
  })
}

/** @deprecated for new code — prefer `useMe()` from `@/features/shared`.
 *  Kept as the profile-shaped view onto the same query. */
export function useProfile() {
  return useMe()
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

export function useStorageStats(offset = 0) {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.storage(offset),
    queryFn: () => settingsApi.getStorage(offset),
    staleTime: 5 * 60 * 1000,
  })
}

export function useDeleteOrphans() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.deleteOrphans,
    // Refetch on failure too: a refused selection means the report is stale.
    onSettled: () => qc.invalidateQueries({ queryKey: [...SETTINGS_QUERY_KEYS.all, 'storage'] }),
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
